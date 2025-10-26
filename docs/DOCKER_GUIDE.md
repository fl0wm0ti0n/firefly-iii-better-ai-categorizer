# Docker Deployment Guide

## 🐳 Overview

This guide covers deploying the Firefly III AI Categorizer using Docker with both production and development configurations.

## 🚀 Quick Start (Production)

### **Prerequisites**
- Docker Engine 20.10+
- Docker Compose 2.0+
- Firefly III instance (accessible from Docker container)
- OpenAI API key

### **1. Clone and Setup**
```bash
git clone <repository-url>
cd firefly-iii-ai-categorize

# Copy environment template
cp env.docker.example .env

# Edit your environment variables
nano .env
```

### **2. Configure Environment**
Edit `.env` file with your settings:
```bash
# Required
FIREFLY_URL=https://your-firefly-instance.com
FIREFLY_PERSONAL_TOKEN=your-firefly-personal-access-token
OPENAI_API_KEY=sk-your-openai-api-key

# Optional
ENABLE_UI=true
PORT=3000
FIREFLY_TAG=AI categorized
OPENAI_MODEL=gpt-4o-mini
```

### **3. Deploy**
```bash
# Build and start
docker-compose up -d

# Check logs
docker-compose logs -f

# Check health
docker-compose ps
```

### **4. Access**
- **Web UI**: http://localhost:3000
- **Webhook URL**: http://localhost:3000/webhook (for Firefly III)

## 🛠️ Development Setup

### **1. Development Environment**
```bash
# Use development compose file
docker-compose -f docker-compose.dev.yml up

# Or use npm script
npm run docker:dev
```

### **2. Development Features**
- **Hot Reloading**: Code changes automatically restart the app
- **Debugging**: Node.js debugger on port 9229
- **Development Tools**: Additional packages and utilities
- **Volume Mounting**: Local code mounted for instant changes

### **3. Debugging**
```bash
# Connect debugger to port 9229
# In VS Code: use "Attach to Node.js/Docker" configuration
```

## 📁 File Structure

### **Volume Mounts**
```
Host                          Container
./data/                  →    /app/data/
./logs/                  →    /app/logs/
./failed-transactions.json → /app/failed-transactions.json
./word-mappings.json     →    /app/word-mappings.json
./auto-categorization-config.json → /app/auto-categorization-config.json
./category-mappings.json →    /app/category-mappings.json
```

### **Directory Creation**
```bash
# Create required directories
mkdir -p data logs

# Set permissions (if needed)
chmod 755 data logs
```

## ⚙️ Configuration Options

### **Environment Variables**

#### **Required**
- `FIREFLY_URL` - Your Firefly III instance URL
- `FIREFLY_PERSONAL_TOKEN` - Firefly III Personal Access Token
- `OPENAI_API_KEY` - OpenAI API key

#### **Optional**
- `ENABLE_UI=true` - Enable web interface
- `PORT=3000` - Application port
- `FIREFLY_TAG=AI categorized` - Tag for processed transactions
- `OPENAI_MODEL=gpt-4o-mini` - OpenAI model to use
- `NODE_ENV=production` - Environment mode

### **Resource Limits**
```yaml
# In docker-compose.yml
deploy:
  resources:
    limits:
      memory: 512M      # Maximum memory
      cpus: '0.5'       # Maximum CPU
    reservations:
      memory: 256M      # Reserved memory
      cpus: '0.25'      # Reserved CPU
```

## 🔧 Docker Commands

### **Basic Operations**
```bash
# Build image
docker build -t firefly-ai-categorizer .

# Run container
docker run -d \
  --name firefly-ai-categorizer \
  -p 3000:3000 \
  --env-file .env \
  firefly-ai-categorizer

# Stop container
docker stop firefly-ai-categorizer

# Remove container
docker rm firefly-ai-categorizer
```

### **Docker Compose Operations**
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart services
docker-compose restart

# View logs
docker-compose logs -f

# Update and rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### **NPM Scripts**
```bash
# Production deployment
npm run docker:build    # Build image
npm run docker:run      # Start with docker-compose
npm run docker:stop     # Stop services
npm run docker:logs     # View logs

# Development
npm run docker:dev      # Start development environment
```

## 🔒 Security Features

### **Container Security**
- **Non-root user**: Runs as user ID 1001
- **Read-only filesystem**: Where possible
- **Dropped capabilities**: Minimal required capabilities
- **No new privileges**: Security flag enabled
- **Resource limits**: Memory and CPU constraints

### **Network Security**
- **Custom network**: Isolated container network
- **Port exposure**: Only necessary ports exposed
- **Internal communication**: Secured container-to-container communication

## 📊 Monitoring & Health Checks

### **Health Check**
```bash
# Manual health check
docker exec firefly-ai-categorizer \
  node -e "require('http').get('http://localhost:3000/health', (res) => { console.log(res.statusCode) })"

# View health status
docker-compose ps
```

### **Logs**
```bash
# Container logs
docker-compose logs firefly-ai-categorizer

# Application logs (if mounted)
tail -f logs/app.log

# Follow logs in real-time
docker-compose logs -f --tail=100
```

### **Resource Monitoring**
```bash
# Container resource usage
docker stats firefly-ai-categorizer

# System information
docker system df
docker system info
```

## 🔄 Updates & Maintenance

### **Updating the Application**
```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Verify update
docker-compose logs -f
```

### **Backup Configuration**
```bash
# Backup configuration files
tar -czf backup-$(date +%Y%m%d).tar.gz \
  .env \
  failed-transactions.json \
  word-mappings.json \
  auto-categorization-config.json \
  category-mappings.json \
  data/ \
  logs/
```

### **Database Cleanup**
```bash
# Clean up old logs
docker exec firefly-ai-categorizer find /app/logs -name "*.log" -mtime +30 -delete

# Clean up failed transactions
# Use the web UI "Cleanup" button or API endpoint
```

## 🐛 Troubleshooting

### **Common Issues**

#### **Container Won't Start**
```bash
# Check logs
docker-compose logs firefly-ai-categorizer

# Check environment variables
docker-compose config

# Verify file permissions
ls -la failed-transactions.json word-mappings.json
```

#### **Permission Errors**
```bash
# Fix file ownership
sudo chown -R 1001:1001 data/ logs/
sudo chown 1001:1001 *.json

# Fix permissions
chmod 755 data/ logs/
chmod 644 *.json
```

#### **Network Issues**
```bash
# Check if Firefly III is reachable
docker exec firefly-ai-categorizer curl -I $FIREFLY_URL

# Check container network
docker network ls
docker network inspect firefly-ai-network
```

#### **Memory Issues**
```bash
# Check memory usage
docker stats firefly-ai-categorizer

# Increase memory limits in docker-compose.yml
# memory: 1G
```

### **Debug Mode**
```bash
# Run with debug output
docker-compose -f docker-compose.dev.yml up

# Enable Node.js debugging
# Set DEBUG=firefly:* in environment
```

### **Reset Configuration**
```bash
# Reset to defaults (backup first!)
rm -f failed-transactions.json word-mappings.json auto-categorization-config.json category-mappings.json

# Restart container to recreate files
docker-compose restart
```

## 🌐 Firefly III Integration

### **Webhook Setup**
1. **Login to Firefly III**
2. **Go to**: Automation → Webhooks
3. **Create webhook** with:
   - **URL**: `http://your-docker-host:3000/webhook`
   - **Trigger**: After transaction creation
   - **Response**: Transaction details
   - **Delivery**: JSON

### **Network Configuration**
If Firefly III and the categorizer are in different Docker networks:
```yaml
# In docker-compose.yml
networks:
  firefly-network:
    external: true
    name: firefly_default  # Use Firefly's network name
```

## 📈 Performance Optimization

### **Resource Tuning**
```yaml
# Optimize for your workload
deploy:
  resources:
    limits:
      memory: 1G        # Increase for large datasets
      cpus: '1.0'       # Increase for faster processing
```

### **Volume Optimization**
```bash
# Use named volumes for better performance
volumes:
  app-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /fast/ssd/path
```

## 🎯 Production Recommendations

### **Essential Setup**
1. **Use `.env` file** for configuration
2. **Mount persistent volumes** for data
3. **Set resource limits** appropriate for your system
4. **Enable health checks** for monitoring
5. **Use restart policies** for reliability
6. **Regular backups** of configuration

### **Monitoring Setup**
```bash
# Add to your monitoring stack
# Prometheus, Grafana, etc.
```

### **Load Balancing**
```yaml
# For high availability
# Use multiple instances with load balancer
```

This Docker setup provides a **robust**, **secure**, and **scalable** deployment for the Firefly III AI Categorizer! 🚀 