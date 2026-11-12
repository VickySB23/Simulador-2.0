FROM nginxinc/nginx-unprivileged:1.28-alpine

# Solo la configuración y los archivos estáticos: sin paso de build.
# La imagen corre como el usuario nginx (uid 101); los archivos solo necesitan ser legibles.
COPY seguridad.conf /etc/nginx/snippets/seguridad.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/

EXPOSE 8080
HEALTHCHECK --interval=5s --timeout=3s --start-period=3s --retries=10 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]
