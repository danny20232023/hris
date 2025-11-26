@echo off
echo ========================================
echo Building BiometricHelper.exe
echo ========================================
echo.

cd /d "%~dp0"

echo Checking for .NET SDK...
dotnet --version
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: .NET SDK not found
    echo Please install .NET SDK 6.0 or later from https://dotnet.microsoft.com/download
    pause
    exit /b 1
)

echo.
echo Building Release configuration...
dotnet build -c Release

if %ERRORLEVEL% EQ 0 (
    echo.
    echo ========================================
    echo ✅ BUILD SUCCESSFUL!
    echo ========================================
    echo.
    echo Executable location:
    echo %~dp0bin\Release\net48\BiometricHelper.exe
    echo.
    echo Usage:
    echo   BiometricHelper.exe enroll ^<userId^> ^<fingerId^> ^<userName^>
    echo   BiometricHelper.exe verify ^<templatesJson^>
    echo.
) else (
    echo.
    echo ========================================
    echo ❌ BUILD FAILED
    echo ========================================
    echo.
    echo Please check the error messages above.
    pause
    exit /b 1
)

pause

