FROM node:23-alpine

WORKDIR /work

RUN apk update
RUN apk add nginx

COPY ./web .

RUN npm run build

ENTRYPOINT /usr/sbin/nginx -g 'daemon off;' -c /work/nginx.conf

RUN ls
