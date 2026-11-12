FROM nginx:1.28-alpine

# Solo la configuración y los archivos estáticos: sin paso de build.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public/ /usr/share/nginx/html/

EXPOSE 80
HEALTHCHECK --interval=5s --timeout=3s --start-period=3s --retries=10 \
    CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/healthz"]
