using System;
using System.Windows.Forms;
using System.Text;
using DPFP.Gui;

namespace BiometricHelper
{
    class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                if (args.Length == 0)
                {
                    WriteJson(new { success = false, error = "No command specified. Use: enroll or verify" });
                    Environment.Exit(1);
                }

                string command = args[0].ToLower();

                switch (command)
                {
                    case "enroll":
                        if (args.Length < 4)
                        {
                            WriteJson(new { success = false, error = "Usage: BiometricHelper.exe enroll <userId> <fingerId> <userName>" });
                            Environment.Exit(1);
                        }
                        PerformEnrollment(args[1], args[2], args[3]);
                        break;

                    case "verify":
                        if (args.Length < 2)
                        {
                            WriteJson(new { success = false, error = "Usage: BiometricHelper.exe verify <templatesJson>" });
                            Environment.Exit(1);
                        }
                        PerformVerification(args[1]);
                        break;

                    default:
                        WriteJson(new { success = false, error = "Unknown command. Use: enroll or verify" });
                        Environment.Exit(1);
                        break;
                }
            }
            catch (Exception ex)
            {
                WriteJson(new { success = false, error = ex.Message, stackTrace = ex.StackTrace });
                Environment.Exit(1);
            }
        }

        // Simple JSON writer for .NET Framework 4.8 compatibility
        static void WriteJson(object obj)
        {
            var sb = new StringBuilder();
            sb.Append("{");
            
            var props = obj.GetType().GetProperties();
            for (int i = 0; i < props.Length; i++)
            {
                if (i > 0) sb.Append(",");
                
                var prop = props[i];
                var value = prop.GetValue(obj, null);
                
                sb.Append($"\"{prop.Name}\":");
                
                if (value == null)
                {
                    sb.Append("null");
                }
                else if (value is string)
                {
                    sb.Append($"\"{value.ToString().Replace("\"", "\\\"")}\"");
                }
                else if (value is bool)
                {
                    sb.Append(value.ToString().ToLower());
                }
                else
                {
                    sb.Append($"\"{value}\"");
                }
            }
            
            sb.Append("}");
            Console.WriteLine(sb.ToString());
        }

        static void PerformEnrollment(string userId, string fingerId, string userName)
        {
            var enrollForm = new HeadlessEnrollmentForm(userId, fingerId, userName);
            Application.Run(enrollForm);
        }

        static void PerformVerification(string templatesJson)
        {
            var verifyForm = new HeadlessVerificationForm(templatesJson);
            Application.Run(verifyForm);
        }
    }

    // Headless enrollment using DPFP.Gui.Enrollment.EnrollmentControl
    public class HeadlessEnrollmentForm : Form
    {
        private DPFP.Gui.Enrollment.EnrollmentControl enrollmentControl;
        private string userId;
        private string fingerId;
        private string userName;
        private bool enrollmentComplete = false;

        private System.Windows.Forms.Timer timeoutTimer;
        
        public HeadlessEnrollmentForm(string uid, string fid, string name)
        {
            userId = uid;
            fingerId = fid;
            userName = name;

            // Create the enrollment control
            enrollmentControl = new DPFP.Gui.Enrollment.EnrollmentControl();
            enrollmentControl.MaxEnrollFingerCount = 1;

            // Subscribe to enrollment events
            enrollmentControl.OnEnroll += EnrollmentControl_OnEnroll;
            enrollmentControl.OnCancelEnroll += EnrollmentControl_OnCancelEnroll;
            enrollmentControl.OnComplete += EnrollmentControl_OnComplete;
            enrollmentControl.OnSampleQuality += EnrollmentControl_OnSampleQuality;
            enrollmentControl.OnStartEnroll += EnrollmentControl_OnStartEnroll;
            enrollmentControl.OnFingerTouch += EnrollmentControl_OnFingerTouch;
            enrollmentControl.OnFingerRemove += EnrollmentControl_OnFingerRemove;
            enrollmentControl.OnReaderConnect += EnrollmentControl_OnReaderConnect;
            enrollmentControl.OnReaderDisconnect += EnrollmentControl_OnReaderDisconnect;

            // Add control to form (required for message pump to work)
            this.Controls.Add(enrollmentControl);
            enrollmentControl.Dock = System.Windows.Forms.DockStyle.Fill;
            
            // Make form properly sized for DPFP.Gui enrollment UI
            this.Text = $"DigitalPersona Enrollment - Finger {fid} - User {uid}";
            this.Size = new System.Drawing.Size(600, 500);
            this.MinimumSize = new System.Drawing.Size(500, 400);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.Sizable; // Allow resizing
            this.MaximizeBox = true;
            this.MinimizeBox = true;
            this.ShowInTaskbar = true;
            this.TopMost = true; // Keep on top
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Dpi; // Support high DPI
            
            // Add timeout (30 seconds)
            timeoutTimer = new System.Windows.Forms.Timer();
            timeoutTimer.Interval = 30000; // 30 seconds
            timeoutTimer.Tick += TimeoutTimer_Tick;
            
            this.Load += HeadlessEnrollmentForm_Load;
        }

        private void TimeoutTimer_Tick(object sender, EventArgs e)
        {
            timeoutTimer.Stop();
            Console.Error.WriteLine("[TIMEOUT] Enrollment timeout - no fingerprint captured within 30 seconds");
            Console.WriteLine("{\"success\":false,\"message\":\"Enrollment timeout - please ensure DigitalPersona reader is connected and working\"}");
            Console.Out.Flush();
            Environment.Exit(1);
        }

        private void EnrollmentControl_OnStartEnroll(object Control, string ReaderSerialNumber, int Finger)
        {
            Console.Error.WriteLine($"[INFO] Enrollment started on reader {ReaderSerialNumber}");
        }

        private void EnrollmentControl_OnFingerTouch(object Control, string ReaderSerialNumber, int Finger)
        {
            Console.Error.WriteLine($"[INFO] Finger touched on reader {ReaderSerialNumber}");
        }

        private void EnrollmentControl_OnFingerRemove(object Control, string ReaderSerialNumber, int Finger)
        {
            Console.Error.WriteLine($"[INFO] Finger removed from reader {ReaderSerialNumber}");
        }

        private void EnrollmentControl_OnReaderConnect(object Control, string ReaderSerialNumber, int Finger)
        {
            Console.Error.WriteLine($"[INFO] Reader connected: {ReaderSerialNumber}");
        }

        private void EnrollmentControl_OnReaderDisconnect(object Control, string ReaderSerialNumber, int Finger)
        {
            Console.Error.WriteLine($"[WARN] Reader disconnected: {ReaderSerialNumber}");
        }

        private void HeadlessEnrollmentForm_Load(object sender, EventArgs e)
        {
            // Form loaded, enrollment control starts automatically
            Console.Error.WriteLine($"[INFO] Enrollment started for User: {userId}, Finger: {fingerId}");
            Console.Error.WriteLine($"[INFO] DPFP.Gui.EnrollmentControl activated");
            Console.Error.WriteLine($"[INFO] Place finger on DigitalPersona scanner to begin enrollment...");
            Console.Error.WriteLine($"[INFO] Waiting for fingerprint reader to detect finger...");
            
            // Start timeout timer
            timeoutTimer.Start();
            Console.Error.WriteLine($"[INFO] Timeout: 30 seconds");
        }

        private void EnrollmentControl_OnEnroll(object Control, int Finger, DPFP.Template Template, ref DPFP.Gui.EventHandlerStatus Status)
        {
            try
            {
                Console.Error.WriteLine($"[SUCCESS] Enrollment complete! Template created.");

                // Serialize template to Base64
                byte[] templateBytes = Template.Bytes;
                string templateBase64 = Convert.ToBase64String(templateBytes);

                Console.Error.WriteLine($"[INFO] Template size: {templateBytes.Length} bytes");
                Console.Error.WriteLine($"[INFO] Detected finger: {Finger}");
                Console.Error.WriteLine($"[INFO] Writing JSON output...");
                
                // Output success JSON to stdout (use the detected Finger ID from the SDK, not the requested fingerId)
                Console.WriteLine($"{{\"success\":true,\"message\":\"Fingerprint enrolled successfully using DPFP.Gui\",\"userId\":\"{userId}\",\"fingerId\":{Finger},\"detectedFinger\":{Finger},\"requestedFingerId\":\"{fingerId}\",\"userName\":\"{userName}\",\"templateBase64\":\"{templateBase64}\",\"templateSize\":{templateBytes.Length},\"method\":\"dpfp_gui_sdk\"}}");
                Console.Out.Flush(); // Force output immediately
                
                Console.Error.WriteLine($"[INFO] JSON written successfully");
                
                enrollmentComplete = true;
                Status = DPFP.Gui.EventHandlerStatus.Success;
                
                // Safely exit after this event completes
                this.BeginInvoke(new Action(() => {
                    try
                    {
                        Console.Error.WriteLine($"[INFO] Cleaning up enrollment control...");
                        // Stop timeout timer
                        if (timeoutTimer != null)
                        {
                            timeoutTimer.Stop();
                            timeoutTimer.Dispose();
                        }
                        // Remove and dispose control safely
                        if (enrollmentControl != null)
                        {
                            this.Controls.Remove(enrollmentControl);
                            enrollmentControl.Dispose();
                            enrollmentControl = null;
                        }
                        Console.Error.WriteLine($"[INFO] Exiting application...");
                        Application.ExitThread(); // Exit message loop cleanly
                    }
                    catch (Exception cleanupEx)
                    {
                        Console.Error.WriteLine($"[WARN] Cleanup error (non-fatal): {cleanupEx.Message}");
                        Environment.Exit(0); // Force exit if cleanup fails
                    }
                }));
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ERROR] {ex.Message}");
                Status = DPFP.Gui.EventHandlerStatus.Failure;
                Environment.Exit(1); // Force exit on error
            }
        }

        private void EnrollmentControl_OnCancelEnroll(object Control, string ReaderSerialNumber, int Finger)
        {
            Console.Error.WriteLine($"[WARN] Enrollment cancelled");
            Console.WriteLine("{\"success\":false,\"message\":\"Enrollment cancelled\"}");
            Console.Out.Flush();
            Environment.Exit(1);
        }

        private void EnrollmentControl_OnComplete(object Control, string ReaderSerialNumber, int Finger)
        {
            Console.Error.WriteLine($"[INFO] Sample captured for finger {Finger}");
        }

        private void EnrollmentControl_OnSampleQuality(object Control, string ReaderSerialNumber, int Finger, DPFP.Capture.CaptureFeedback CaptureFeedback)
        {
            Console.Error.WriteLine($"[INFO] Sample quality: {CaptureFeedback}");
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            base.OnFormClosing(e);
            
            if (!enrollmentComplete)
            {
                Console.WriteLine("{\"success\":false,\"message\":\"Enrollment not completed\"}");
            }
        }
    }

    // User template data for verification
    public class UserTemplate
    {
        public string UserId { get; set; }
        public string FingerId { get; set; }
        public string Name { get; set; }
        public string TemplateBase64 { get; set; }
        public DPFP.Template Template { get; set; }
    }

    // Headless verification using DPFP.Gui.Verification.VerificationControl
    public class HeadlessVerificationForm : Form
    {
        private DPFP.Gui.Verification.VerificationControl verificationControl;
        private System.Collections.Generic.List<UserTemplate> userTemplates;
        private System.Windows.Forms.Timer timeoutTimer;

        public HeadlessVerificationForm(string templatesJson)
        {
            userTemplates = new System.Collections.Generic.List<UserTemplate>();
            
            // Parse templates JSON array
            // Expected format: [{"userId":"123","fingerId":"0","name":"John","templateBase64":"..."},...]
            try
            {
                Console.Error.WriteLine($"[INFO] Parsing templates JSON...");
                // Simple JSON parsing for array of templates
                var jsonArray = templatesJson.Trim().TrimStart('[').TrimEnd(']');
                var items = jsonArray.Split(new string[] { "},{" }, StringSplitOptions.None);
                
                foreach (var item in items)
                {
                    var cleaned = item.Trim('{', '}');
                    var userTemplate = new UserTemplate();
                    
                    // Parse JSON properties
                    var pairs = cleaned.Split(',');
                    foreach (var pair in pairs)
                    {
                        var kv = pair.Split(new char[] { ':' }, 2);
                        if (kv.Length == 2)
                        {
                            var key = kv[0].Trim().Trim('"');
                            var value = kv[1].Trim().Trim('"');
                            
                            if (key == "userId") userTemplate.UserId = value;
                            else if (key == "fingerId") userTemplate.FingerId = value;
                            else if (key == "name") userTemplate.Name = value;
                            else if (key == "templateBase64") userTemplate.TemplateBase64 = value;
                        }
                    }
                    
                    // Deserialize template
                    if (!string.IsNullOrEmpty(userTemplate.TemplateBase64))
                    {
                        byte[] templateBytes = Convert.FromBase64String(userTemplate.TemplateBase64);
                        userTemplate.Template = new DPFP.Template();
                        userTemplate.Template.DeSerialize(templateBytes);
                        userTemplates.Add(userTemplate);
                        Console.Error.WriteLine($"[INFO] Loaded template for User: {userTemplate.Name}, Finger: {userTemplate.FingerId}");
                    }
                }
                
                Console.Error.WriteLine($"[INFO] Total templates loaded: {userTemplates.Count}");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ERROR] Failed to parse templates: {ex.Message}");
            }

            // Create verification control
            verificationControl = new DPFP.Gui.Verification.VerificationControl();
            verificationControl.Active = true;

            // Subscribe to verification event
            verificationControl.OnComplete += VerificationControl_OnComplete;

            // Add control to form
            this.Controls.Add(verificationControl);
            verificationControl.Dock = System.Windows.Forms.DockStyle.Fill;
            
            // Make form properly sized for DPFP.Gui verification UI
            this.Text = "DigitalPersona Biometric Login";
            this.Size = new System.Drawing.Size(500, 400);
            this.MinimumSize = new System.Drawing.Size(400, 350);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.Sizable;
            this.MaximizeBox = true;
            this.MinimizeBox = true;
            this.ShowInTaskbar = true;
            this.TopMost = true;
            this.AutoScaleMode = System.Windows.Forms.AutoScaleMode.Dpi;
            
            // Add timeout (15 seconds for login)
            timeoutTimer = new System.Windows.Forms.Timer();
            timeoutTimer.Interval = 15000; // 15 seconds
            timeoutTimer.Tick += TimeoutTimer_Tick;

            this.Load += HeadlessVerificationForm_Load;
        }
        
        private void TimeoutTimer_Tick(object sender, EventArgs e)
        {
            timeoutTimer.Stop();
            Console.Error.WriteLine("[TIMEOUT] Verification timeout - no fingerprint captured within 15 seconds");
            Console.WriteLine("{\"success\":false,\"authenticated\":false,\"message\":\"Verification timeout\"}");
            Environment.Exit(1);
        }

        private void HeadlessVerificationForm_Load(object sender, EventArgs e)
        {
            Console.Error.WriteLine($"[INFO] Verification started");
            Console.Error.WriteLine($"[INFO] Loaded {userTemplates.Count} user templates");
            Console.Error.WriteLine($"[INFO] Place finger on DigitalPersona scanner to login...");
            
            // Start timeout timer
            timeoutTimer.Start();
            Console.Error.WriteLine($"[INFO] Timeout: 15 seconds");
        }

        private void VerificationControl_OnComplete(object Control, DPFP.FeatureSet FeatureSet, ref DPFP.Gui.EventHandlerStatus Status)
        {
            try
            {
                // Stop timeout timer
                if (timeoutTimer != null)
                {
                    timeoutTimer.Stop();
                    timeoutTimer.Dispose();
                }
                
                Console.Error.WriteLine($"[INFO] Fingerprint captured, verifying against {userTemplates.Count} templates...");

                // Verify against all user templates
                DPFP.Verification.Verification verificator = new DPFP.Verification.Verification();
                // FARRequested can be set optionally for stricter verification (default is usually good)
                
                UserTemplate matchedUser = null;
                double bestMatchScore = 0;

                foreach (var userTemplate in userTemplates)
                {
                    if (userTemplate.Template != null)
                    {
                        DPFP.Verification.Verification.Result result = new DPFP.Verification.Verification.Result();
                        verificator.Verify(FeatureSet, userTemplate.Template, ref result);

                        Console.Error.WriteLine($"[INFO] Checking User: {userTemplate.Name}, Finger: {userTemplate.FingerId} - Verified: {result.Verified}, FAR: {result.FARAchieved}");

                        if (result.Verified)
                        {
                            // Track best match (lowest FAR is best)
                            double matchScore = 1.0 / (result.FARAchieved + 0.0001); // Lower FAR = better match
                            if (matchScore > bestMatchScore)
                            {
                                bestMatchScore = matchScore;
                                matchedUser = userTemplate;
                            }
                        }
                    }
                }

                if (matchedUser != null)
                {
                    Console.Error.WriteLine($"[SUCCESS] Match found!");
                    Console.Error.WriteLine($"[INFO] User: {matchedUser.Name}");
                    Console.Error.WriteLine($"[INFO] Finger: {matchedUser.FingerId}");
                    Console.Error.WriteLine($"[INFO] Writing JSON output...");
                    
                    Console.WriteLine($"{{\"success\":true,\"authenticated\":true,\"message\":\"Fingerprint verified using DPFP.Gui\",\"userId\":\"{matchedUser.UserId}\",\"fingerId\":\"{matchedUser.FingerId}\",\"name\":\"{matchedUser.Name}\",\"method\":\"dpfp_gui_sdk\"}}");
                    Console.Out.Flush();
                    Status = DPFP.Gui.EventHandlerStatus.Success;
                }
                else
                {
                    Console.Error.WriteLine($"[FAILED] No match found");
                    Console.WriteLine("{\"success\":false,\"authenticated\":false,\"message\":\"Fingerprint not recognized\"}");
                    Console.Out.Flush();
                    Status = DPFP.Gui.EventHandlerStatus.Failure;
                }

                // Safely exit
                this.BeginInvoke(new Action(() => {
                    try
                    {
                        if (verificationControl != null)
                        {
                            this.Controls.Remove(verificationControl);
                            verificationControl.Dispose();
                            verificationControl = null;
                        }
                        Application.ExitThread();
                    }
                    catch
                    {
                        Environment.Exit(0);
                    }
                }));
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[ERROR] {ex.Message}");
                Console.WriteLine("{\"success\":false,\"authenticated\":false,\"message\":\"Verification error: " + ex.Message + "\"}");
                Console.Out.Flush();
                Status = DPFP.Gui.EventHandlerStatus.Failure;
                Environment.Exit(1);
            }
        }
    }
}

