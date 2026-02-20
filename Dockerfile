# Dockerfile for frametv-art-gallery (backend)
# Use official Python image as base
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Expose port (adjust if needed)
EXPOSE 8000

# Set environment variables (optional)
ENV PYTHONUNBUFFERED=1

# Start the app with gunicorn
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:8000"]
