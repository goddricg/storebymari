'use client';

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type LoginResponse = {
  user?: {
    id: string;
    email: string;
    displayName: string | null;
  };
  message?: string;
};

type LoginFormProps = {
  onSuccess?: () => void;
  identifierMode?: "email" | "username-or-email";
};

export default function LoginForm({
  onSuccess,
  identifierMode = "email",
}: LoginFormProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (identifierMode === "username-or-email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const message = "ระบบบัญชีปัจจุบันรองรับการเข้าสู่ระบบด้วยอีเมลเท่านั้น กรุณากรอกอีเมลที่ถูกต้อง";
      setErrorMessage(message);
      toast.error(message);
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        });

        let data: LoginResponse | null = null;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          try {
            data = (await response.json()) as LoginResponse;
          } catch (error) {
            console.error("ไม่สามารถอ่านข้อมูล JSON จากการเข้าสู่ระบบ", error);
          }
        }

        if (!response.ok) {
          const message = data?.message ?? "เข้าสู่ระบบไม่สำเร็จ";
          setErrorMessage(message);
          toast.error(message);
          return;
        }

        toast.success("เข้าสู่ระบบสำเร็จ", {
          description: "ยินดีต้อนรับกลับ",
        });
        
        // Dispatch custom event to notify Navbar to reload session
        window.dispatchEvent(new Event("auth:session-changed"));
        
        if (onSuccess) {
          onSuccess();
        } else {
          const requestedDestination = new URLSearchParams(window.location.search).get("next");
          router.replace(requestedDestination === "/admin" ? "/admin" : "/");
        }
        router.refresh();
      } catch (error) {
        console.error("เกิดข้อผิดพลาดในการเข้าสู่ระบบ", error);
        const message = "ไม่สามารถติดต่อเซิร์ฟเวอร์ได้ กรุณาลองอีกครั้ง";
        setErrorMessage(message);
        toast.error(message);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">
          {identifierMode === "username-or-email" ? "Username / Email" : "อีเมล"}
        </Label>
        <Input
          id="email"
          name="email"
          type={identifierMode === "username-or-email" ? "text" : "email"}
          inputMode={identifierMode === "username-or-email" ? "text" : "email"}
          placeholder={identifierMode === "username-or-email" ? "Username หรือ name@example.com" : "name@example.com"}
          required
          autoComplete={identifierMode === "username-or-email" ? "username" : "email"}
          className="text-[#0B0B0B] placeholder:text-[#9CA3AF] caret-[#0B0B0B]"
        />
        {identifierMode === "username-or-email" ? (
          <p className="text-xs text-[#6B7280]">
            ระบบเข้าสู่ระบบที่มีอยู่รองรับอีเมลเท่านั้น
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          required
          autoComplete="current-password"
          className="text-[#0B0B0B] placeholder:text-[#9CA3AF] caret-[#0B0B0B]"
        />
      </div>

      <Button
        type="submit"
        className={
          identifierMode === "username-or-email"
            ? "w-full rounded-xl bg-[#a41461] text-white hover:bg-[#87104f]"
            : "w-full rounded-xl bg-[var(--theme-color)] hover:bg-[var(--theme-color)]"
        }
        disabled={isPending}
      >
        {isPending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </Button>
    </form>
  );
}
