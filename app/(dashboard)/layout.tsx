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
            background: "#111111",
            color: "#fff",
            border: "1px solid #2a2a2a",
            fontSize: "12px",
          },
        }}
      />
    </>
  );
}
