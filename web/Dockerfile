FROM node:22 AS build-stage

WORKDIR /work

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

ARG VITE_GOOGLE_API_KEY
ENV VITE_GOOGLE_API_KEY=$VITE_GOOGLE_API_KEY
ARG VITE_BASEMAP_PMTILES_URL=/maps/japan-light-20251201-v1.pmtiles
ENV VITE_BASEMAP_PMTILES_URL=$VITE_BASEMAP_PMTILES_URL

RUN npm run build


FROM nginx:1.30.0

COPY --from=build-stage /work/build/client /work/build/client
COPY nginx.template.conf /etc/nginx/nginx.template.conf
COPY reflect-envs.sh /docker-entrypoint.d/reflect-envs.sh
RUN chmod +x /docker-entrypoint.d/reflect-envs.sh

EXPOSE 80
