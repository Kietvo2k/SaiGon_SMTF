FROM node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS build
WORKDIR /build/outputs/smart-traffic/web
COPY outputs/smart-traffic/web/package*.json ./
RUN npm ci
COPY outputs/smart-traffic/web ./
COPY outputs/shared/public-demo /build/outputs/shared/public-demo
ENV VITE_TRANSPORT_MODE=local VITE_API_BASE=/api/v1 VITE_WS_URL=/ws/v1
RUN npm run build

FROM nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236
# Tài nguyên lớn ở layer riêng: sửa JS/UI không chép và giải nén lại toàn bộ nền 3D.
COPY outputs/hcmc-poc/assets/ /usr/share/nginx/html/hcmc-poc/assets/
COPY outputs/hcmc-poc/vendor/ /usr/share/nginx/html/hcmc-poc/vendor/
COPY outputs/hcmc-poc/data/ /usr/share/nginx/html/hcmc-poc/data/
COPY outputs/shared/digital-twin-core/ /usr/share/nginx/html/shared/digital-twin-core/
COPY outputs/shared/public-demo/ /usr/share/nginx/html/shared/public-demo/
COPY --from=build /build/outputs/smart-traffic/web/dist/ /usr/share/nginx/html/
COPY docker/index.html /usr/share/nginx/html/index.html
COPY outputs/hcmc-poc/*.js outputs/hcmc-poc/*.html outputs/hcmc-poc/*.css /usr/share/nginx/html/hcmc-poc/
# Giữ đúng URL seed mà mô phỏng đang dùng, chỉ công khai ba JSON cần thiết.
COPY outputs/smart-traffic/backend/app/seed/cameras.json outputs/smart-traffic/backend/app/seed/plates.json outputs/smart-traffic/backend/app/seed/node_map.json /usr/share/nginx/html/smart-traffic/backend/app/seed/
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
