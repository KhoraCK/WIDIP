# ===========================================
# WIBOT - Script d'installation Windows 11
# ===========================================
# Prerequis: Docker Desktop installe
# Usage: Clic droit > Executer avec PowerShell
#    ou: powershell -ExecutionPolicy Bypass -File setup-windows.ps1
# ===========================================

$ErrorActionPreference = "Stop"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Couleurs pour l'affichage
function Write-Step { param($msg) Write-Host "`n[*] $msg" -ForegroundColor Cyan }
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Error { param($msg) Write-Host "[ERREUR] $msg" -ForegroundColor Red }
function Write-Warning { param($msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Info { param($msg) Write-Host "    $msg" -ForegroundColor Gray }

Clear-Host
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "   WIBOT - Installation Windows 11" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""

# ===========================================
# 1. Verification Docker
# ===========================================
Write-Step "Verification de Docker Desktop..."

$dockerInstalled = Get-Command docker -ErrorAction SilentlyContinue
if (-not $dockerInstalled) {
    Write-Error "Docker n'est pas installe ou pas dans le PATH."
    Write-Info "Installez Docker Desktop depuis: https://www.docker.com/products/docker-desktop/"
    Write-Host "`nAppuyez sur une touche pour quitter..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# Verifier que Docker daemon tourne
try {
    $dockerInfo = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Docker daemon non accessible"
    }
    Write-Success "Docker Desktop est installe et fonctionne"
} catch {
    Write-Error "Docker Desktop n'est pas demarre."
    Write-Info "Demarrez Docker Desktop et relancez ce script."
    Write-Host "`nAppuyez sur une touche pour quitter..." -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# ===========================================
# 2. Verification/Installation Node.js
# ===========================================
Write-Step "Verification de Node.js..."

$nodeInstalled = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeInstalled) {
    Write-Warning "Node.js n'est pas installe."
    Write-Info "Installation via winget..."

    try {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements

        # Rafraichir le PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

        # Verifier l'installation
        $nodeInstalled = Get-Command node -ErrorAction SilentlyContinue
        if (-not $nodeInstalled) {
            Write-Warning "Node.js installe mais necessite un redemarrage du terminal."
            Write-Info "Fermez cette fenetre, ouvrez un nouveau PowerShell et relancez le script."
            Write-Host "`nAppuyez sur une touche pour quitter..." -ForegroundColor Yellow
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
            exit 0
        }
        Write-Success "Node.js installe avec succes"
    } catch {
        Write-Error "Impossible d'installer Node.js automatiquement."
        Write-Info "Installez Node.js manuellement depuis: https://nodejs.org/"
        Write-Host "`nAppuyez sur une touche pour quitter..." -ForegroundColor Yellow
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }
} else {
    $nodeVersion = node --version
    Write-Success "Node.js est installe (version $nodeVersion)"
}

# Verifier npm
$npmInstalled = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmInstalled) {
    Write-Error "npm n'est pas disponible. Reinstallez Node.js."
    exit 1
}
$npmVersion = npm --version
Write-Success "npm est disponible (version $npmVersion)"

# ===========================================
# 3. Configuration du fichier .env
# ===========================================
Write-Step "Configuration du fichier .env..."

$backendPath = Join-Path $scriptPath "wibot-backend"
$envFile = Join-Path $backendPath ".env"
$envExample = Join-Path $backendPath "env.example"

if (Test-Path $envFile) {
    Write-Success "Fichier .env existe deja"
    Write-Info "Pour reconfigurer, supprimez $envFile et relancez le script"
} else {
    if (-not (Test-Path $envExample)) {
        Write-Error "Fichier env.example introuvable dans wibot-backend"
        exit 1
    }

    # Copier le fichier exemple
    Copy-Item $envExample $envFile
    Write-Success "Fichier .env cree depuis env.example"

    # Demander la cle Mistral
    Write-Host ""
    Write-Host "Configuration de l'API Mistral" -ForegroundColor Yellow
    Write-Info "La cle API Mistral est necessaire pour les fonctionnalites IA."
    Write-Info "Obtenez une cle sur: https://console.mistral.ai/"
    Write-Host ""
    $mistralKey = Read-Host "Entrez votre cle API Mistral (ou appuyez sur Entree pour configurer plus tard)"

    if ($mistralKey -and $mistralKey.Trim() -ne "") {
        $envContent = Get-Content $envFile -Raw
        $envContent = $envContent -replace "MISTRAL_API_KEY=your_mistral_api_key_here", "MISTRAL_API_KEY=$mistralKey"
        Set-Content $envFile $envContent -NoNewline
        Write-Success "Cle API Mistral configuree"
    } else {
        Write-Warning "Cle Mistral non configuree - editez $envFile plus tard"
    }
}

# ===========================================
# 4. Installation des dependances Frontend
# ===========================================
Write-Step "Installation des dependances frontend (npm install)..."

$frontendPath = Join-Path $scriptPath "wibot-frontend"

if (-not (Test-Path $frontendPath)) {
    Write-Error "Dossier wibot-frontend introuvable"
    exit 1
}

Push-Location $frontendPath
try {
    Write-Info "Cette etape peut prendre quelques minutes..."
    npm install 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "npm install a echoue"
    }
    Write-Success "Dependances frontend installees"
} catch {
    Write-Error "Echec de l'installation des dependances npm"
    Write-Info "Essayez manuellement: cd wibot-frontend && npm install"
    Pop-Location
    exit 1
}
Pop-Location

# ===========================================
# 5. Pre-telechargement des images Docker
# ===========================================
Write-Step "Pre-telechargement des images Docker..."

Write-Info "Telechargement de pgvector/pgvector:pg14..."
docker pull pgvector/pgvector:pg14 2>&1 | Out-Null

Write-Info "Telechargement de n8nio/n8n:latest..."
docker pull n8nio/n8n:latest 2>&1 | Out-Null

Write-Info "Telechargement de nginx:alpine..."
docker pull nginx:alpine 2>&1 | Out-Null

Write-Success "Images Docker telechargees"

# ===========================================
# Resume
# ===========================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   Installation terminee !" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Pour demarrer WIBOT:" -ForegroundColor Cyan
Write-Host "  Double-cliquez sur start.bat" -ForegroundColor White
Write-Host ""
Write-Host "Acces:" -ForegroundColor Cyan
Write-Host "  Frontend    : http://localhost:5173" -ForegroundColor White
Write-Host "  n8n Editor  : http://localhost:5679" -ForegroundColor White
Write-Host ""
Write-Host "Identifiants par defaut:" -ForegroundColor Cyan
Write-Host "  Utilisateur : khora" -ForegroundColor White
Write-Host "  Mot de passe: test123" -ForegroundColor White
Write-Host ""

if (-not $mistralKey -or $mistralKey.Trim() -eq "") {
    Write-Warning "N'oubliez pas de configurer votre cle API Mistral dans:"
    Write-Info "$envFile"
    Write-Host ""
}

Write-Host "Appuyez sur une touche pour quitter..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
