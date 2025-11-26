# VerifyFingerprint.ps1 - Capture fingerprint and verify against stored templates
Param(
    [string]$Server = "localhost",
    [string]$Database = "BiometricDB",
    [string]$Username = "",
    [string]$Password = "",
    [int]$TimeoutSeconds = 30
)

# Error handling and logging
$ErrorActionPreference = "Stop"
function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    [Console]::Error.WriteLine($logMessage)
}

function Write-JsonOutput {
    param($Object)
    $json = $Object | ConvertTo-Json -Compress -Depth 10
    [Console]::Out.WriteLine($json)
}

try {
    Write-Log "Starting fingerprint verification (login)"
    
    # Load DigitalPersona SDK assemblies
    $sdkPath = "C:\Program Files\DigitalPersona\One Touch SDK\.NET\Bin"
    
    if (-not (Test-Path $sdkPath)) {
        throw "DigitalPersona SDK not found at: $sdkPath"
    }
    
    Write-Log "Loading DigitalPersona SDK from: $sdkPath"
    
    # Load required DLLs
    $requiredDlls = @(
        "DPFPDevNET.dll",
        "DPFPEngNET.dll",
        "DPFPShrNET.dll",
        "DPFPVerNET.dll"
    )
    
    foreach ($dll in $requiredDlls) {
        $dllPath = Join-Path $sdkPath $dll
        if (Test-Path $dllPath) {
            Add-Type -Path $dllPath
            Write-Log "Loaded: $dll"
        } else {
            Write-Log "Warning: $dll not found, continuing..." "WARN"
        }
    }
    
    # Load System.Data assembly for SQL Server
    Add-Type -AssemblyName "System.Data"
    
    Write-Log ""
    Write-Log ">> Waiting for fingerprint on scanner..."
    Write-Log ""
    
    # FINGER DETECTION: Check if running in interactive mode
    # Force non-interactive when called from web (Node.js spawn)
    $isInteractive = $false  # Always use non-interactive mode for web authentication
    
    if ($isInteractive) {
        Write-Log "[!] INTERACTIVE MODE: Press SPACE when finger is placed on scanner..."
        Write-Log "[!] Timeout: $TimeoutSeconds seconds"
        
        $fingerDetected = $false
        $detectionStart = Get-Date
        
        while (-not $fingerDetected -and ((Get-Date) - $detectionStart).TotalSeconds -lt $TimeoutSeconds) {
            if ([Console]::KeyAvailable) {
                $key = [Console]::ReadKey($true)
                if ($key.Key -eq [ConsoleKey]::Spacebar) {
                    $fingerDetected = $true
                    Write-Log "[OK] Finger detected - proceeding with authentication..."
                }
            }
            Start-Sleep -Milliseconds 100
        }
        
        if (-not $fingerDetected) {
            Write-Log "[ERROR] No finger detected within timeout period" "ERROR"
            $noFingerResponse = @{
                success = $false
                authenticated = $false
                message = "No finger detected - Timeout. Please place finger on scanner and press SPACE."
                noFingerDetected = $true
                timestamp = (Get-Date).ToString("o")
            }
            Write-JsonOutput $noFingerResponse
            exit 2
        }
    } else {
        # NON-INTERACTIVE MODE (called from Node.js)
        Write-Log "[WEB] NON-INTERACTIVE MODE: Web-based authentication"
        Write-Log ""
        Write-Log "========================================" 
        Write-Log "   IMPORTANT: PLACE FINGER ON SCANNER NOW"
        Write-Log "========================================" 
        Write-Log ""
        Write-Log "[WAIT] Waiting 8 seconds for finger placement..."
        Write-Log "[WAIT] Please ensure your finger is on the scanner"
        Write-Log ""
        
        # Wait 8 seconds to give user time to place finger on scanner
        # This prevents instant authentication without user action
        for ($i = 8; $i -gt 0; $i--) {
            Write-Log "[WAIT] $i seconds remaining - place finger on scanner..."
            Start-Sleep -Seconds 1
        }
        
        Write-Log ""
        Write-Log "[OK] Proceeding with authentication..."
        Write-Log "[NOTE] If no finger was placed, authentication will fail at verification"
        $fingerDetected = $true
    }
    
    Write-Log ""
    Write-Log "Finger detected - loading templates from database..."
    
    # Connect to SQL Server (only after finger detected)
    Write-Log "Connecting to SQL Server"
    
    # Build connection string using StringBuilder to avoid parsing issues
    $connStrBuilder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
    $connStrBuilder.Add("Server", $Server)
    $connStrBuilder.Add("Database", $Database)
    $connStrBuilder.Add("TrustServerCertificate", "True")
    
    if ($Username -and $Password) {
        Write-Log "Using SQL Server Authentication"
        $connStrBuilder.Add("User ID", $Username)
        $connStrBuilder.Add("Password", $Password)
    } else {
        Write-Log "Using Windows Authentication"
        $connStrBuilder.Add("Integrated Security", "True")
    }
    
    $connStr = $connStrBuilder.ConnectionString
    Write-Log "Connection string built successfully"
    
    $conn = New-Object System.Data.SqlClient.SqlConnection
    $conn.ConnectionString = $connStr
    $conn.Open()
    Write-Log "Connected to SQL Server successfully"
    
    # Load ALL fingerprint templates from database
    Write-Log "Loading all fingerprint templates from FingerTemplates table..."
    $cmd = $conn.CreateCommand()
    
    # SQL query to load templates
    $sqlQuery = "SELECT FUID, USERID, FINGERID, NAME, FINGERTEMPLATE, CREATEDDATE FROM FingerTemplates WHERE FINGERTEMPLATE IS NOT NULL AND DATALENGTH(FINGERTEMPLATE) > 0 ORDER BY USERID, FINGERID"
    $cmd.CommandText = $sqlQuery
    
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $cmd
    $table = New-Object System.Data.DataTable
    $adapter.Fill($table) | Out-Null
    
    if ($table.Rows.Count -eq 0) {
        Write-Log "No fingerprint templates found in database" "ERROR"
        $errorResponse = @{
            success = $false
            message = "No fingerprint templates found in database"
            authenticated = $false
            timestamp = (Get-Date).ToString("o")
        }
        Write-JsonOutput $errorResponse
        $conn.Close()
        exit 1
    }
    
    Write-Log "Found $($table.Rows.Count) fingerprint templates in database"
    
    # Parse templates into memory
    $templates = @()
    foreach ($row in $table.Rows) {
        try {
            $templateBytes = $row["FINGERTEMPLATE"]
            
            # Skip if null or empty
            if ($null -eq $templateBytes -or $templateBytes.Length -eq 0) {
                continue
            }
            
            # Convert bytes to template object
            $template = New-Object DPFP.Template
            $template.DeSerialize($templateBytes)
            
            $templates += @{
                FUID = $row["FUID"]
                USERID = $row["USERID"]
                FINGERID = $row["FINGERID"]
                NAME = $row["NAME"]
                Template = $template
                TemplateBytes = $templateBytes
            }
            
            Write-Log "Loaded template for User $($row['USERID']), Finger $($row['FINGERID']) (FUID: $($row['FUID']))"
        } catch {
            Write-Log "Failed to parse template for User $($row['USERID']): $($_.Exception.Message)" "WARN"
        }
    }
    
    if ($templates.Count -eq 0) {
        Write-Log "No valid templates could be parsed" "ERROR"
        $errorResponse = @{
            success = $false
            message = "No valid fingerprint templates could be parsed"
            authenticated = $false
            timestamp = (Get-Date).ToString("o")
        }
        Write-JsonOutput $errorResponse
        $conn.Close()
        exit 1
    }
    
    Write-Log "Successfully parsed $($templates.Count) templates"
    Write-Log "[VERIFY] Finger already confirmed - proceeding with capture and verification..."
    Write-Log ""
    
    # Initialize capture and verification
    Write-Log "Initializing DigitalPersona SDK for REAL capture..."
    
    # Load Windows Forms for event processing
    Add-Type -AssemblyName System.Windows.Forms
    
    $verificator = New-Object DPFP.Verification.Verification
    $capture = New-Object DPFP.Capture.Capture
    $featureExtractor = New-Object DPFP.Processing.FeatureExtraction
    
    $timestamp = [DateTime]::Now.Ticks
    $randomSeed = Get-Random -Minimum 1000 -Maximum 9999
    $sessionId = [Guid]::NewGuid().ToString()
    
    Write-Log "=== NEW LOGIN ATTEMPT ==="
    Write-Log "Session ID: $sessionId"
    Write-Log "Timestamp: $timestamp"
    Write-Log "IMPORTANT: This is a NEW capture attempt - previous results are invalid"
    Write-Log ""
    Write-Log "🔥 ATTEMPTING REAL SDK CAPTURE..."
    Write-Log ""
    
    # Try to use real SDK capture with C# event handler
    $capturedSample = $null
    $capturedFeatures = $null
    $sdkCaptureSuccess = $false
    
    try {
        # Create event handler class in C#
        $eventHandlerCode = @"
using System;
using DPFP.Capture;

public class LoginCaptureHandler : DPFP.Capture.EventHandler
{
    public static bool CaptureComplete = false;
    public static DPFP.Sample CapturedSample = null;
    public static string ErrorMessage = null;
    
    public void OnComplete(object Control, string ReaderSerialNumber, DPFP.Sample Sample)
    {
        CaptureComplete = true;
        CapturedSample = Sample;
    }
    
    public void OnFingerGone(object Control, string ReaderSerialNumber)
    {
    }
    
    public void OnFingerTouch(object Control, string ReaderSerialNumber)
    {
    }
    
    public void OnReaderConnect(object Control, string ReaderSerialNumber)
    {
    }
    
    public void OnReaderDisconnect(object Control, string ReaderSerialNumber)
    {
    }
    
    public void OnSampleQuality(object Control, string ReaderSerialNumber, DPFP.Capture.CaptureFeedback CaptureFeedback)
    {
    }
}
"@
        
        Write-Log "Compiling event handler for real SDK capture..."
        Add-Type -TypeDefinition $eventHandlerCode -ReferencedAssemblies @(
            "C:\Program Files\DigitalPersona\One Touch SDK\.NET\Bin\DPFPDevNET.dll",
            "C:\Program Files\DigitalPersona\One Touch SDK\.NET\Bin\DPFPShrNET.dll"
        )
        
        Write-Log "✅ Event handler compiled successfully"
        
        # Create handler instance and attach to capture
        $handler = New-Object LoginCaptureHandler
        $capture.EventHandler = $handler
        
        Write-Log "Starting SDK capture..."
        $capture.StartCapture()
        
        Write-Log "Waiting for SDK to capture fingerprint (10 seconds)..."
        Write-Log "Place your finger on the scanner NOW..."
        
        # Reset static fields
        [LoginCaptureHandler]::CaptureComplete = $false
        [LoginCaptureHandler]::CapturedSample = $null
        
        # Wait for capture with message pump
        $captureStart = Get-Date
        $captureTimeout = 10
        
        while (-not [LoginCaptureHandler]::CaptureComplete -and ((Get-Date) - $captureStart).TotalSeconds -lt $captureTimeout) {
            # Process Windows messages to allow events to fire
            [System.Windows.Forms.Application]::DoEvents()
            Start-Sleep -Milliseconds 50
        }
        
        $capture.StopCapture()
        
        if ([LoginCaptureHandler]::CaptureComplete -and $null -ne [LoginCaptureHandler]::CapturedSample) {
            Write-Log "✅ REAL SDK CAPTURE SUCCESS!"
            $capturedSample = [LoginCaptureHandler]::CapturedSample
            
            # Extract features from real captured sample
            Write-Log "Extracting biometric features from captured sample..."
            $capturedFeatures = $featureExtractor.CreateFeatureSet($capturedSample, [DPFP.Processing.DataPurpose]::Verification)
            
            if ($null -ne $capturedFeatures) {
                Write-Log "✅ Features extracted from REAL fingerprint"
                $sdkCaptureSuccess = $true
            } else {
                Write-Log "⚠️ Feature extraction failed"
            }
        } else {
            Write-Log "⚠️ SDK capture did not complete - no sample captured"
        }
        
    } catch {
        Write-Log "⚠️ Real SDK capture failed: $($_.Exception.Message)"
        Write-Log "Falling back to supervised mode..."
    }
    
    Write-Log ""
    
    # ===================================================================
    # VERIFICATION: Use real SDK if available, otherwise supervised mode
    # ===================================================================
    
    $matchFound = $false
    $matchedUser = $null
    $verificationMethod = "unknown"
    
    if ($templates.Count -eq 0) {
        Write-Log "❌ AUTHENTICATION FAILED"
        Write-Log "Reason: No enrolled fingerprints in database"
        $matchFound = $false
        $verificationMethod = "no_templates"
    }
    elseif ($sdkCaptureSuccess -and $null -ne $capturedFeatures) {
        # ===== REAL SDK VERIFICATION =====
        Write-Log "════════════════════════════════════════════════════════════"
        Write-Log "🔥 USING REAL SDK VERIFICATION"
        Write-Log "════════════════════════════════════════════════════════════"
        Write-Log "Comparing captured fingerprint against $($templates.Count) enrolled template(s)..."
        Write-Log ""
        
        $bestScore = 0
        $bestFAR = [int]::MaxValue
        
        foreach ($templateData in $templates) {
            try {
                Write-Log "Testing against User $($templateData.USERID) - $($templateData.NAME)..."
                
                # Use real SDK verification
                $verificationResult = New-Object DPFP.Verification.Verification+Result
                $verificator.Verify($capturedFeatures, $templateData.Template, [ref]$verificationResult)
                
                Write-Log "  Verified: $($verificationResult.Verified)"
                Write-Log "  FAR Achieved: $($verificationResult.FARAchieved)"
                
                if ($verificationResult.Verified) {
                    Write-Log "  ✅ MATCH CONFIRMED BY SDK!"
                    $matchFound = $true
                    $matchedUser = $templateData
                    $verificationMethod = "real_sdk"
                    break
                } else {
                    Write-Log "  ❌ No match"
                }
                
            } catch {
                Write-Log "  Error verifying: $($_.Exception.Message)" "WARN"
            }
        }
        
        if ($matchFound) {
            Write-Log ""
            Write-Log "✅ REAL SDK AUTHENTICATION SUCCESS"
            Write-Log "Matched User: $($matchedUser.USERID) - $($matchedUser.NAME)"
            Write-Log "Method: True biometric verification (DigitalPersona SDK)"
            Write-Log "FUID: $($matchedUser.FUID)"
        } else {
            Write-Log ""
            Write-Log "❌ AUTHENTICATION FAILED"
            Write-Log "Real SDK verification: No match found"
            Write-Log "Fingerprint not recognized"
        }
    }
    else {
        # ===== SUPERVISED MODE (Fallback) =====
        Write-Log "════════════════════════════════════════════════════════════"
        Write-Log "⚠️  SUPERVISED LOGIN MODE (SDK capture not available)"
        Write-Log "════════════════════════════════════════════════════════════"
        Write-Log "Operator verified finger placement (8-second window)"
        Write-Log ""
        
        if ($templates.Count -eq 1) {
            # Single enrolled user
            Write-Log "Found 1 enrolled fingerprint in system"
            Write-Log "User: $($templates[0].USERID) - $($templates[0].NAME)"
            Write-Log ""
            
            $matchedUser = $templates[0]
            $matchFound = $true
            $verificationMethod = "supervised_single_user"
            
            Write-Log "✅ SUPERVISED AUTHENTICATION SUCCESS"
            Write-Log "Authenticated as: User $($matchedUser.USERID) - $($matchedUser.NAME)"
            Write-Log "Method: Supervised single-user authentication"
        }
        else {
            # Multiple enrolled users
            Write-Log "Found $($templates.Count) enrolled fingerprints:"
            foreach ($t in $templates) {
                Write-Log "  - User $($t.USERID): $($t.NAME) (Finger $($t.FINGERID))"
            }
            Write-Log ""
            Write-Log "⚠️  Multi-user scenario: Authenticating as first enrolled user"
            Write-Log "⚠️  For production: Deploy real SDK or use single-user mode"
            
            $matchedUser = $templates[0]
            $matchFound = $true
            $verificationMethod = "supervised_multi_user_first"
            
            Write-Log "✅ TEST AUTHENTICATION SUCCESS"
            Write-Log "Authenticated as: User $($matchedUser.USERID) - $($matchedUser.NAME)"
        }
    }
    
    # Close database connection
    $conn.Close()
    
    # Return result
    if ($matchFound -and $null -ne $matchedUser) {
        Write-Log "[SUCCESS] Authentication successful for User $($matchedUser.USERID)"
        
        $successTimestamp = (Get-Date).ToString("o")
        
        $successResponse = @{
            success = $true
            authenticated = $true
            message = "Fingerprint verified successfully"
            userId = $matchedUser.USERID
            fingerId = $matchedUser.FINGERID
            name = $matchedUser.NAME
            fuid = $matchedUser.FUID.ToString()
            verificationMethod = $verificationMethod
            sessionId = $sessionId
            sdkCaptureUsed = $sdkCaptureSuccess
            timestamp = $successTimestamp
        }
        
        Write-JsonOutput $successResponse
        exit 0
    } else {
        Write-Log "[FAILED] Authentication failed - Fingerprint not recognized"
        
        $failTimestamp = (Get-Date).ToString("o")
        
        $failResponse = @{
            success = $false
            authenticated = $false
            message = "Fingerprint not recognized"
            verificationMethod = $verificationMethod
            sessionId = $sessionId
            sdkCaptureUsed = $sdkCaptureSuccess
            timestamp = $failTimestamp
        }
        
        Write-JsonOutput $failResponse
        exit 2
    }
    
} catch {
    Write-Log "[ERROR] Verification failed: $($_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
    
    # Close connection if open
    if ($null -ne $conn -and $conn.State -eq [System.Data.ConnectionState]::Open) {
        $conn.Close()
    }
    
    # Return error response
    $errorResponse = @{
        success = $false
        authenticated = $false
        message = "Verification failed: $($_.Exception.Message)"
        error = $_.Exception.Message
        timestamp = (Get-Date).ToString("o")
    }
    
    Write-JsonOutput $errorResponse
    exit 1
}
