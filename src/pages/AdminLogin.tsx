import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, LogIn, UserPlus } from "lucide-react";

const AdminLogin = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [regName, setRegName] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Check admin or super_admin role with approved status
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role, status")
        .eq("user_id", data.user.id)
        .in("role", ["admin", "super_admin"]);

      const hasAccess = roleData?.some(
        (r) => r.role === "super_admin" || (r.role === "admin" && r.status === "approved")
      );

      if (!hasAccess) {
        const isPending = roleData?.some((r) => r.status === "pending");
        await supabase.auth.signOut();
        if (isPending) {
          throw new Error("Your admin request is pending approval. Contact the super admin.");
        }
        const isRejected = roleData?.some((r) => r.status === "rejected");
        if (isRejected) {
          throw new Error("Your admin request was rejected. Contact the super admin.");
        }
        throw new Error("You do not have admin access. Register for admin access below.");
      }

      toast.success("Welcome, Admin!");
      navigate("/admin/dashboard");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || password.length < 8) {
      toast.error("Valid email and password (8+ characters) required");
      return;
    }
    setLoading(true);
    try {
      // Sign up the user
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: regName } },
      });
      if (error) throw error;
      if (!data.user) throw new Error("Registration failed");

      // Insert a pending admin role request
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: data.user.id, role: "admin", status: "pending" });

      if (roleError) throw roleError;

      await supabase.auth.signOut();
      toast.success("Admin request submitted! Awaiting super admin approval.");
      setMode("login");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-xl shadow-elevated p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent/10 mb-2">
              <Shield className="w-7 h-7 text-accent" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              {mode === "login" ? "Admin Login" : "Request Admin Access"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {mode === "login"
                ? "Sign in to manage staff verification"
                : "Register and await super admin approval"}
            </p>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="admin@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                    Signing in…
                  </span>
                ) : (
                  <span className="flex items-center gap-2"><LogIn className="w-4 h-4" /> Sign In</span>
                )}
              </Button>
              <button type="button" onClick={() => setMode("register")} className="w-full text-center text-sm text-accent hover:underline">
                Need admin access? Register here
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-name">Full Name</Label>
                <Input id="reg-name" placeholder="Your full name" value={regName} onChange={(e) => setRegName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-email">Email</Label>
                <Input id="reg-email" type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">Password</Label>
                <Input id="reg-password" type="password" placeholder="Min 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                    Registering…
                  </span>
                ) : (
                  <span className="flex items-center gap-2"><UserPlus className="w-4 h-4" /> Request Admin Access</span>
                )}
              </Button>
              <button type="button" onClick={() => setMode("login")} className="w-full text-center text-sm text-accent hover:underline">
                Already have access? Sign in
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
