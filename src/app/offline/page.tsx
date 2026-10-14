"use client";

export default function OfflinePage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#010313",
        color: "#fff",
        fontFamily: "'Inter', sans-serif",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "4rem", marginBottom: "1.5rem" }}>📡</div>
      <h1
        style={{
          fontSize: "1.75rem",
          fontWeight: 700,
          marginBottom: "0.75rem",
        }}
      >
        You&apos;re Offline
      </h1>
      <p
        style={{
          fontSize: "1rem",
          color: "#94a3b8",
          maxWidth: "400px",
          lineHeight: 1.6,
          marginBottom: "2rem",
        }}
      >
        Uniq Social needs an internet connection to process your videos. Check
        your connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "0.75rem 2rem",
          borderRadius: "0.5rem",
          border: "1px solid rgba(255,255,255,0.15)",
          background: "rgba(255,255,255,0.05)",
          color: "#fff",
          fontSize: "0.9rem",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Try Again
      </button>
    </div>
  );
}
