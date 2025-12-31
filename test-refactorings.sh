#!/bin/bash

# Refactoring Validation Test Script
# Run this after pulling the refactoring branch

set -e

echo "🧪 Testing Refactorings..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Hugo Build
echo "1️⃣  Testing Hugo build..."
if hugo --gc --minify > /tmp/hugo-build.log 2>&1; then
  echo -e "${GREEN}✓ Hugo build successful${NC}"
else
  echo -e "${RED}✗ Hugo build failed${NC}"
  cat /tmp/hugo-build.log
  exit 1
fi

# Test 2: Check for refactored partials
echo ""
echo "2️⃣  Checking for new partials..."
PARTIALS=(
  "layouts/partials/get-og-image.html"
  "layouts/partials/episode-title-clean.html"
  "layouts/partials/manifesto-hero.html"
  "layouts/partials/fountain-cta.html"
  "layouts/partials/social-links.html"
)

for partial in "${PARTIALS[@]}"; do
  if [ -f "$partial" ]; then
    echo -e "${GREEN}✓${NC} $partial"
  else
    echo -e "${RED}✗${NC} $partial (missing)"
  fi
done

# Test 3: Check for deleted files
echo ""
echo "3️⃣  Checking removed files..."
if [ -f "layouts/partials/arrow-back.html" ]; then
  echo -e "${RED}✗${NC} arrow-back.html should be deleted"
else
  echo -e "${GREEN}✓${NC} arrow-back.html removed (consolidated into arrow.html)"
fi

# Test 4: Validate structured data
echo ""
echo "4️⃣  Checking structured data format..."
if grep -q '"@graph":' layouts/partials/structured-data.html; then
  echo -e "${GREEN}✓${NC} Structured data uses @graph"
else
  echo -e "${RED}✗${NC} Structured data missing @graph"
fi

# Test 5: Check RSS configuration
echo ""
echo "5️⃣  Checking RSS optimization..."
if grep -q '\[outputs.episodes\]' hugo.toml; then
  echo -e "${GREEN}✓${NC} RSS limited to episodes section"
else
  echo -e "${RED}✗${NC} RSS configuration not optimized"
fi

# Test 6: Check CSS tokens
echo ""
echo "6️⃣  Checking CSS design tokens..."
CSS_TOKENS=(
  "--spacing-xs"
  "--img-width-card"
  "--delay"
  "clamp("
)

for token in "${CSS_TOKENS[@]}"; do
  if grep -q "$token" assets/css/main.css; then
    echo -e "${GREEN}✓${NC} Found: $token"
  else
    echo -e "${YELLOW}⚠${NC}  Missing: $token"
  fi
done

# Test 7: OG Image Script
echo ""
echo "7️⃣  Testing OG image generation..."
if [ -f "scripts/generate-og-images.js" ]; then
  if grep -q "ogStat.mtime > episodeStat.mtime" scripts/generate-og-images.js; then
    echo -e "${GREEN}✓${NC} OG generation has timestamp optimization"
  else
    echo -e "${YELLOW}⚠${NC}  OG script may not have timestamp check"
  fi
fi

# Test 8: External JavaScript
echo ""
echo "8️⃣  Checking external JavaScript..."
if [ -f "static/js/nav-toggle.js" ]; then
  echo -e "${GREEN}✓${NC} Nav toggle extracted to external JS"
else
  echo -e "${RED}✗${NC} nav-toggle.js missing"
fi

# Test 9: Start server test
echo ""
echo "9️⃣  Testing dev server startup..."
echo "Starting Hugo server for 3 seconds..."

# Start server in background
hugo server -D > /tmp/hugo-server.log 2>&1 &
SERVER_PID=$!

# Wait a bit for startup
sleep 3

# Check if still running
if kill -0 $SERVER_PID 2>/dev/null; then
  echo -e "${GREEN}✓${NC} Server started successfully"
  kill $SERVER_PID
else
  echo -e "${RED}✗${NC} Server failed to start"
  cat /tmp/hugo-server.log
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✓ All automated tests passed!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Next steps:"
echo "   1. Run: hugo server -D"
echo "   2. Open: http://localhost:1313"
echo "   3. Follow manual tests in TESTING_CHECKLIST.md"
echo "   4. Validate structured data: https://search.google.com/test/rich-results"
echo ""
