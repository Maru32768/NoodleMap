FROM nginx:1.27.3

WORKDIR /work

RUN apt update
RUN apt install -y nodejs npm

COPY ./web .
COPY ./web/nginx.template.conf /etc/nginx/nginx.template.conf
COPY ./web/reflect-envs.sh /docker-entrypoint.d/reflect-envs.sh
RUN chmod +x /docker-entrypoint.d/reflect-envs.sh

RUN npm run build

EXPOSE 80
