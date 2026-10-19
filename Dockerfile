FROM node:22-slim AS web
WORKDIR /web
COPY freezerWatch/web/package.json freezerWatch/web/package-lock.json ./
RUN npm ci
COPY freezerWatch/web ./
RUN npm run build

FROM python:3.12-slim

WORKDIR /app
COPY freezerWatch/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY data /app/data
COPY freezerWatch /app/freezerWatch
COPY --from=web /web/dist /app/freezerWatch/web/dist

ENV HOST=0.0.0.0
ENV PORT=8765
ENV PYTHONUNBUFFERED=1

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=3s --start-period=25s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8765')+'/api/health')"

WORKDIR /app/freezerWatch/replay
CMD ["sh", "-c", "python -m uvicorn server:app --host ${HOST} --port ${PORT}"]
