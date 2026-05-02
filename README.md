# Home File Server

Simple single-directory file server with a web-based file-manager UI.

## Features

- **Authentication**: Secure login with username and password (configurable via `.env`).
- **File Management**: Browse folders, upload files, download files.
- **Organization**: Create new folders, rename files/folders, delete files/folders.
- **Preview**: Built-in preview for images, videos, PDFs, and text files.

## Setup

1. Copy the `.env.example` file to `.env` (or create one) and set your desired credentials:
   ```env
   APP_USERNAME=admin
   APP_PASSWORD=mysecurepassword
   APP_ROOT_DIR=./data
   ```

2. Run the application:
   ```bash
   # from the project root
   go run main.go

   # or build and run
   go build -o home-server
   ./home-server
   ```

## Options

- `-root`: Root directory to serve (defaults to `APP_ROOT_DIR` from `.env`, or `./data`)
- `-addr`: Listen address (default `:8080`)
- `-username`: Login username (defaults to `USERNAME` from `.env`, or `admin`)
- `-password`: Login password (defaults to `PASSWORD` from `.env`, or `welcome123`)

Open [http://localhost:8080](http://localhost:8080) in your browser to access the server.

## Installation (System-wide)

To access the server from anywhere using the `home-server` command:

1. Build the binary:
   ```bash
   go build -o home-server
   ```

2. Move it to your local bin directory:
   ```bash
   sudo mv home-server /usr/local/bin/
   ```

Now you can run `home-server -root /path/to/data` from any terminal.

## Auto-start on Boot (systemd)

To make the server start automatically when your system boots:

1. Create a service file:
   ```bash
   sudo nano /etc/systemd/system/home-server.service
   ```

2. Paste the following configuration (replace `yourusername` with your actual Linux username and adjust paths):
   ```ini
   [Unit]
   Description=Home File Server
   After=network.target

   [Service]
   Type=simple
   User=yourusername
   WorkingDirectory=/home/yourusername/Documents/home-server
   ExecStart=/usr/local/bin/home-server -root /home/yourusername/Documents/home-server/data -addr :8080
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

3. Enable and start the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable home-server
   sudo systemctl start home-server
   ```

Check status with `sudo systemctl status home-server`.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.