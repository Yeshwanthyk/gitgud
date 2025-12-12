#!/usr/bin/env bash
set -euo pipefail

# gitgud installer
# Usage: curl -fsSL https://raw.githubusercontent.com/yesh/gitgud/main/install.sh | bash

REPO="Yeshwanthyk/gitgud"
INSTALL_DIR="${GITGUD_INSTALL_DIR:-$HOME/.local/bin}"

# Detect OS and architecture
detect_platform() {
    local os arch

    case "$(uname -s)" in
        Darwin) os="darwin" ;;
        Linux)  os="linux" ;;
        *)      echo "Unsupported OS: $(uname -s)"; exit 1 ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64)  arch="x64" ;;
        arm64|aarch64) arch="arm64" ;;
        *)             echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
    esac

    echo "${os}-${arch}"
}

# Get latest release tag from GitHub
get_latest_version() {
    curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | 
        grep '"tag_name"' | 
        sed -E 's/.*"([^"]+)".*/\1/'
}

main() {
    echo "Installing gitgud..."
    
    local platform version download_url tmp_file
    
    platform=$(detect_platform)
    echo "Detected platform: ${platform}"
    
    # Try to get latest release, fallback to main branch
    version=$(get_latest_version 2>/dev/null || echo "main")
    echo "Version: ${version}"
    
    if [[ "$version" == "main" ]]; then
        download_url="https://github.com/${REPO}/releases/download/latest/gitgud-${platform}"
    else
        download_url="https://github.com/${REPO}/releases/download/${version}/gitgud-${platform}"
    fi
    
    # Create install directory
    mkdir -p "$INSTALL_DIR"
    
    # Download binary
    tmp_file=$(mktemp)
    echo "Downloading from ${download_url}..."
    
    if ! curl -fsSL "$download_url" -o "$tmp_file"; then
        echo ""
        echo "Download failed. You can also install via npm:"
        echo "  npx gitgud-skills"
        echo ""
        echo "Or with bun:"
        echo "  bun install -g gitgud-skills"
        exit 1
    fi
    
    # Install
    chmod +x "$tmp_file"
    mv "$tmp_file" "${INSTALL_DIR}/gitgud"
    
    echo ""
    echo "✓ Installed gitgud to ${INSTALL_DIR}/gitgud"
    echo ""
    
    # Check if in PATH
    if ! command -v gitgud &>/dev/null; then
        echo "Add ${INSTALL_DIR} to your PATH:"
        echo ""
        echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
        echo ""
        echo "Add this to your ~/.bashrc or ~/.zshrc"
    else
        echo "Run 'gitgud --help' to get started"
    fi
}

main "$@"
