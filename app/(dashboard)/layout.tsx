import { Toaster } from "react-hot-toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: "rgba(0, 0, 0, 0.6)",
            color: "#ffffff",
            border: "1px solid #682FBF",
            fontSize: "13px",
            backdropFilter: "blur(16px)",
            borderRadius: "12px",
          },
        }}
      />
    </>
  );
}
