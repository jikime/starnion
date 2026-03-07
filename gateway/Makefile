.PHONY: all starpion gateway sync-migrations docker-build docker-up docker-down docker-logs docker-ps clean

DOCKER_DIR := ../docker
COMPOSE    := docker compose -f $(DOCKER_DIR)/docker-compose.yml

# Build the starpion CLI binary (output to project root)
starpion: sync-migrations
	go build -o ../starpion ./cmd/starpion

# Build the gateway server
gateway:
	go build -o ../bin/gateway ./cmd/gateway

# Sync migration SQL files from docker/migrations into the CLI embed directory
sync-migrations:
	@echo "Syncing migrations..."
	@rm -rf internal/cli/migrations
	@cp -r ../docker/migrations internal/cli/migrations
	@echo "Synced $$(ls internal/cli/migrations/*.sql 2>/dev/null | wc -l | tr -d ' ') migration files"

# Build everything
all: sync-migrations starpion gateway

# ── Docker targets ────────────────────────────────────────────────────────────

# Initial Docker setup (generates .env, builds images, starts services)
docker-setup:
	@cd $(DOCKER_DIR) && bash setup.sh

# Build Docker images
docker-build:
	$(COMPOSE) build

# Start all services (detached)
docker-up:
	$(COMPOSE) up -d

# Start with build
docker-up-build:
	$(COMPOSE) up -d --build

# Stop all services
docker-down:
	$(COMPOSE) down

# Stop and remove volumes (DESTRUCTIVE)
docker-down-volumes:
	$(COMPOSE) down --volumes

# Show logs (follow)
docker-logs:
	$(COMPOSE) logs -f

# Show running containers
docker-ps:
	$(COMPOSE) ps

# Restart a specific service: make docker-restart SERVICE=gateway
docker-restart:
	$(COMPOSE) restart $(SERVICE)

# ── Release targets ───────────────────────────────────────────────────────────

# Dry-run: validate .goreleaser.yml and simulate a release build (no publish)
release-dry:
	cd .. && goreleaser release --snapshot --clean

# Tag and push a new release: make release VERSION=1.2.0
release:
	@if [ -z "$(VERSION)" ]; then echo "Usage: make release VERSION=x.y.z"; exit 1; fi
	git -C .. tag -a "v$(VERSION)" -m "Release v$(VERSION)"
	git -C .. push origin "v$(VERSION)"

# Remove build artifacts
clean:
	@rm -f ../starpion ../bin/gateway
	@rm -rf internal/cli/migrations
	@echo "Cleaned"
