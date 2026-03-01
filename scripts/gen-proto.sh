#!/usr/bin/env bash
# Generate Go and Python gRPC stubs from proto definitions.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROTO_DIR="${ROOT_DIR}/proto"
PROTO_FILE="${PROTO_DIR}/jiki/v1/agent.proto"

# --- Go ---
GO_OUT="${ROOT_DIR}/gateway/gen"
mkdir -p "${GO_OUT}"

echo "Generating Go stubs..."
protoc \
  --proto_path="${PROTO_DIR}" \
  --go_out="${GO_OUT}" \
  --go_opt=paths=source_relative \
  --go-grpc_out="${GO_OUT}" \
  --go-grpc_opt=paths=source_relative \
  "${PROTO_FILE}"

echo "Go stubs generated in ${GO_OUT}"

# --- Python ---
PY_OUT="${ROOT_DIR}/agent/src/jiki_agent/generated"
mkdir -p "${PY_OUT}"

echo "Generating Python stubs..."
cd "${ROOT_DIR}/agent"
uv run python -m grpc_tools.protoc \
  --proto_path="${PROTO_DIR}" \
  --python_out="${PY_OUT}" \
  --pyi_out="${PY_OUT}" \
  --grpc_python_out="${PY_OUT}" \
  "${PROTO_FILE}"

# Create __init__.py files for the generated package hierarchy.
touch "${PY_OUT}/__init__.py"
mkdir -p "${PY_OUT}/jiki/v1"
touch "${PY_OUT}/jiki/__init__.py"
touch "${PY_OUT}/jiki/v1/__init__.py"

echo "Python stubs generated in ${PY_OUT}"
echo "Done."
