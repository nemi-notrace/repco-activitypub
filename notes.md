1. **Install Nginx** :

If you don't have Nginx installed, you can generally do so with:

```bash
sudo apt update
sudo apt install nginx
```



(The above commands are for Debian-based systems like Ubuntu. Adjust accordingly for other distributions.) 
2. **Start Nginx** :

```bash
sudo systemctl start nginx
``` 
3. **Configure the Reverse Proxy** :

Create a new configuration or edit the default configuration:

```bash
sudo nano /etc/nginx/sites-available/default
```



And add the following configuration inside the `server` block:

```nginx
server {
    listen 80;
    server_name example.zzz;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
``` 
4. **Restart Nginx** :

```bash
sudo systemctl restart nginx
``` 
5. ** file** :

Add your custom domain mapping:

```bash
127.0.0.1   example.zzz
```

Now, when you access `http://example.zzz` in your browser, Nginx will forward the request to `localhost:3000` behind the scenes, and you won't need to specify the port in the URL.

Remember, this solution assumes your application running on `localhost:3000` is an HTTP service. If it uses HTTPS or WebSocket, you'll need to adjust the Nginx configuration accordingly.