package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"image"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

var rootDir string
var authUsername string
var authPassword string

type FileEntry struct {
	Name    string    `json:"name"`
	Path    string    `json:"path"`
	IsDir   bool      `json:"isDir"`
	Size    int64     `json:"size"`
	ModTime time.Time `json:"modTime"`
}

func main() {
	_ = godotenv.Load()

	flag.StringVar(&rootDir, "root", os.Getenv("APP_ROOT_DIR"), "root directory to serve")
	addr := flag.String("addr", ":8080", "address to listen on")
	flag.StringVar(&authUsername, "username", os.Getenv("APP_USERNAME"), "login username")
	flag.StringVar(&authPassword, "password", os.Getenv("APP_PASSWORD"), "login password")
	flag.Parse()

	if authUsername == "" {
		authUsername = "admin"
	}
	if authPassword == "" {
		authPassword = "welcome123"
	}
	if rootDir == "" {
		rootDir = "./data"
	}

	if err := os.MkdirAll(rootDir, 0755); err != nil {
		panic(fmt.Errorf("failed to create root directory: %w", err))
	}

	abs, err := filepath.Abs(rootDir)
	if err != nil {
		panic(err)
	}
	rootDir = abs

	http.HandleFunc("/api/login", loginHandler)
	http.HandleFunc("/api/me", meHandler)
	http.Handle("/api/list", authHandler(http.HandlerFunc(listHandler)))
	http.Handle("/api/thumb", authHandler(http.HandlerFunc(thumbHandler)))
	http.Handle("/api/upload", authHandler(http.HandlerFunc(uploadHandler)))
	http.Handle("/api/delete", authHandler(http.HandlerFunc(deleteHandler)))
	http.Handle("/api/rename", authHandler(http.HandlerFunc(renameHandler)))
	http.Handle("/api/mkdir", authHandler(http.HandlerFunc(mkdirHandler)))
	// serve files under /files/* (protected)
	filesHandler := http.StripPrefix("/files/", http.FileServer(http.Dir(rootDir)))
	http.Handle("/files/", authHandler(filesHandler))
	// serve web UI
	http.Handle("/", http.FileServer(http.Dir("./web")))

	fmt.Printf("Serving root: %s\n", rootDir)
	fmt.Printf("Open http://localhost%s in your browser\n", *addr)
	if err := http.ListenAndServe(*addr, nil); err != nil {
		panic(err)
	}
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func isAuthenticated(r *http.Request) bool {
	cookie, err := r.Cookie("auth")
	if err != nil {
		return false
	}
	return cookie.Value == "1"
}

func authHandler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isAuthenticated(r) {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if req.Username != authUsername || req.Password != authPassword {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     "auth",
		Value:    "1",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	w.WriteHeader(http.StatusOK)
}

func meHandler(w http.ResponseWriter, r *http.Request) {
	if !isAuthenticated(r) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

type PathRequest struct {
	Path string `json:"path"`
}

type RenameRequest struct {
	Path    string `json:"path"`
	NewName string `json:"newName"`
}

func listHandler(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	p := q.Get("path")
	fsPath, ok := resolvePath(p)
	if !ok {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	f, err := os.Open(fsPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer f.Close()
	infos, err := f.Readdir(0)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	entries := make([]FileEntry, 0, len(infos))
	for _, fi := range infos {
		entries = append(entries, FileEntry{
			Name:    fi.Name(),
			Path:    filepath.ToSlash(filepath.Join(p, fi.Name())),
			IsDir:   fi.IsDir(),
			Size:    fi.Size(),
			ModTime: fi.ModTime(),
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

func thumbHandler(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	p := q.Get("path")
	fsPath, ok := resolvePath(p)
	if !ok {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	width := clampThumbSize(parseThumbSize(q.Get("w"), 96))
	height := clampThumbSize(parseThumbSize(q.Get("h"), 96))
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(fsPath), "."))

	if ext == "svg" {
		w.Header().Set("Content-Type", "image/svg+xml")
		http.ServeFile(w, r, fsPath)
		return
	}

	file, err := os.Open(fsPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer file.Close()

	var src image.Image
	switch ext {
	case "jpg", "jpeg":
		src, err = jpeg.Decode(file)
	case "png":
		src, err = png.Decode(file)
	case "gif":
		src, err = gif.Decode(file)
	default:
		http.ServeFile(w, r, fsPath)
		return
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnsupportedMediaType)
		return
	}

	bounds := src.Bounds()
	if bounds.Empty() {
		http.Error(w, "empty image", http.StatusUnsupportedMediaType)
		return
	}

	srcW := bounds.Dx()
	srcH := bounds.Dy()
	scale := float64(width) / float64(srcW)
	if hScale := float64(height) / float64(srcH); hScale < scale {
		scale = hScale
	}
	if scale > 1 {
		scale = 1
	}
	outW := maxInt(1, int(float64(srcW)*scale))
	outH := maxInt(1, int(float64(srcH)*scale))
	thumb := resizeNearest(src, outW, outH)

	w.Header().Set("Cache-Control", "public, max-age=3600")
	switch ext {
	case "jpg", "jpeg":
		w.Header().Set("Content-Type", "image/jpeg")
		_ = jpeg.Encode(w, thumb, &jpeg.Options{Quality: 72})
	case "png":
		w.Header().Set("Content-Type", "image/png")
		_ = png.Encode(w, thumb)
	case "gif":
		w.Header().Set("Content-Type", "image/png")
		_ = png.Encode(w, thumb)
	}
}

func uploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	path := r.FormValue("path")
	dstDir, ok := resolvePath(path)
	if !ok {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	if err := os.MkdirAll(dstDir, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()
	dstPath := filepath.Join(dstDir, header.Filename)
	out, err := os.Create(dstPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer out.Close()
	if _, err := io.Copy(out, file); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func deleteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req PathRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	fsPath, ok := resolvePath(req.Path)
	if !ok {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	if err := os.RemoveAll(fsPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func renameHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req RenameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.NewName) == "" || strings.Contains(req.NewName, "/") || strings.Contains(req.NewName, "\\") {
		http.Error(w, "invalid name", http.StatusBadRequest)
		return
	}
	srcPath, ok := resolvePath(req.Path)
	if !ok {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	parent := filepath.Dir(strings.TrimPrefix(req.Path, "/"))
	if parent == "." {
		parent = ""
	}
	dstRel := filepath.ToSlash(filepath.Join(parent, req.NewName))
	dstPath, ok := resolvePath(dstRel)
	if !ok {
		http.Error(w, "invalid target", http.StatusBadRequest)
		return
	}
	if err := os.Rename(srcPath, dstPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func mkdirHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req PathRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	fsPath, ok := resolvePath(req.Path)
	if !ok {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}
	if err := os.MkdirAll(fsPath, 0755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

// resolvePath ensures the requested relative path stays within rootDir
func resolvePath(rel string) (string, bool) {
	// normalize
	rel = strings.TrimPrefix(rel, "/")
	p := filepath.Clean(rel)
	abs := filepath.Join(rootDir, p)
	abs, err := filepath.Abs(abs)
	if err != nil {
		return "", false
	}
	rootAbs, _ := filepath.Abs(rootDir)
	if !strings.HasPrefix(abs, rootAbs) {
		return "", false
	}
	return abs, true
}

func parseThumbSize(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return n
}

func clampThumbSize(value int) int {
	if value < 24 {
		return 24
	}
	if value > 256 {
		return 256
	}
	return value
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func resizeNearest(src image.Image, width, height int) *image.RGBA {
	dst := image.NewRGBA(image.Rect(0, 0, width, height))
	bounds := src.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()
	for y := 0; y < height; y++ {
		sy := bounds.Min.Y + (y*srcH)/height
		for x := 0; x < width; x++ {
			sx := bounds.Min.X + (x*srcW)/width
			dst.Set(x, y, src.At(sx, sy))
		}
	}
	return dst
}
