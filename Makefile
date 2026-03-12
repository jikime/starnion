.PHONY: starnion gateway all clean \
        docker-build docker-up docker-up-build docker-down \
        docker-down-volumes docker-logs docker-ps release-dry

# ── Build targets ─────────────────────────────────────────────────────────────

# Build the starnion CLI binary (outputs ./starnion in the project root)
starnion:
	$(MAKE) -C gateway starnion

# Build the gateway server binary only
gateway:
	$(MAKE) -C gateway gateway

# Build everything
all:
	$(MAKE) -C gateway all

# Remove build artifacts
clean:
	$(MAKE) -C gateway clean

# ── Docker targets ────────────────────────────────────────────────────────────

docker-build:
	$(MAKE) -C gateway docker-build

docker-up:
	$(MAKE) -C gateway docker-up

docker-up-build:
	$(MAKE) -C gateway docker-up-build

docker-down:
	$(MAKE) -C gateway docker-down

docker-down-volumes:
	$(MAKE) -C gateway docker-down-volumes

docker-logs:
	$(MAKE) -C gateway docker-logs

docker-ps:
	$(MAKE) -C gateway docker-ps

# ── Release ───────────────────────────────────────────────────────────────────

release-dry:
	$(MAKE) -C gateway release-dry
