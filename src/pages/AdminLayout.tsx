import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/AdminSidebar";

const AdminLayout = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/admin");
        return;
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role, status")
        .eq("user_id", session.user.id)
        .in("role", ["admin", "super_admin"]);

      const hasAccess = roleData?.some(
        (r) => r.role === "super_admin" || (r.role === "admin" && r.status === "approved")
      );

      if (!hasAccess) {
        await supabase.auth.signOut();
        navigate("/admin");
        return;
      }

      setIsSuperAdmin(roleData?.some((r) => r.role === "super_admin") || false);
      setLoading(false);
    };

    checkAdmin();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") navigate("/admin");
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <span className="w-8 h-8 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar isSuperAdmin={isSuperAdmin} />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b bg-card px-4">
            <SidebarTrigger className="mr-4" />
            <span className="font-display font-semibold text-sm text-foreground">Staff ID Admin</span>
          </header>
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            <Outlet context={{ isSuperAdmin }} />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default AdminLayout;
