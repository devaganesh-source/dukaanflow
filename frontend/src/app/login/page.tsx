
"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

type AuthResponse = {
  role?: "retailer" | "order_desk"|"salesman";
  detail?: string;
};

export default function LoginPage() {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
        });

        if (!response.ok || !active) return;

        const user = (await response.json()) as AuthResponse;

        if (user.role === "retailer") {
          window.location.replace("/");
        } else if (user.role === "order_desk") {
          window.location.replace("/order-desk");
        }
      } catch {
        // Allow the login form to remain available.
      }
    }

    void checkSession();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function requestCode() {
    const response = await fetch("/api/auth/request-otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ phone }),
    });

    const data = (await response.json()) as AuthResponse;

    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");

      if (response.status === 429 && retryAfter) {
        setStep("otp");
        setCooldown(Number(retryAfter) || 60);
        setNotice("Use the code from your previous request.");
        return;
      }

      throw new Error(data.detail || "Unable to request OTP.");
    }

    setStep("otp");
    setCooldown(60);
    setNotice(
      "If your account exists, your verification code is ready."
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setBusy(true);

    try {
      if (step === "phone") {
        if (!/^\d{10}$/.test(phone)) {
          throw new Error("Enter a valid 10-digit mobile number.");
        }

        await requestCode();
        return;
      }

      if (!/^\d{6}$/.test(otp)) {
        throw new Error("Enter the 6-digit OTP.");
      }

      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ phone, otp }),
      });

      const data = (await response.json()) as AuthResponse;

      if (!response.ok) {
        throw new Error(data.detail || "OTP verification failed.");
      }

      if (
        data.role !== "retailer" &&
        data.role !== "order_desk" &&
        data.role !== "salesman"
       ) {
         throw new Error("Invalid account role.");
       }

       const destination =
         data.role === "retailer"
           ? "/"
           : data.role === "salesman"
             ? "/salesman"
             : "/order-desk";

        window.location.replace(destination);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setError("");
    setNotice("");
    setBusy(true);

    try {
      await requestCode();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to resend OTP."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f7f8f4] text-[#112b25] lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-[#173e30] p-12 text-white lg:flex">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/15 p-3">
            <PackageCheck size={24} />
          </div>
          <span className="text-xl font-semibold">
            DukaanFlow
          </span>
        </div>

        <div className="max-w-lg">
          <p className="mb-5 text-sm font-semibold uppercase tracking-widest text-[#b3dbc3]">
            Smarter retailer ordering
          </p>

          <h1 className="text-5xl font-semibold leading-tight tracking-tight">
            Your business moves fast.
            <br />
            Your orders should too.
          </h1>

          <p className="mt-6 max-w-md text-base leading-7 text-[#c9dfd2]">
            One workspace for product availability,
            retailer pricing, schemes and faster ordering.
          </p>
        </div>

        <p className="text-sm text-[#b1cfc0]">
          Built for retailers, field sales and distributors.
        </p>
      </section>

      <section className="flex min-h-screen flex-col px-5 py-8 sm:px-8 lg:justify-center lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div className="rounded-xl bg-[#176b52] p-3 text-white">
              <PackageCheck size={22} />
            </div>

            <span className="text-xl font-semibold">
              DukaanFlow
            </span>
          </div>

          <div className="rounded-3xl border border-[#e1e8e1] bg-white p-6 shadow-sm sm:p-9">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#edf5ef] text-[#176b52]">
              {step === "phone" ? (
                <Smartphone size={24} />
              ) : (
                <LockKeyhole size={24} />
              )}
            </div>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#176b52]">
              Secure account access
            </p>

            <h2 className="text-2xl font-semibold tracking-tight">
              {step === "phone"
                ? "Welcome back"
                : "Verify your number"}
            </h2>

            <p className="mt-3 text-sm leading-6 text-[#64766a]">
              {step === "phone"
                ? "Enter your registered mobile number to continue."
                : `Enter the verification code for +91 ${phone}.`}
            </p>

            <form
              onSubmit={handleSubmit}
              className="mt-8 space-y-5"
            >
              {step === "phone" ? (
                <div>
                  <label
                    htmlFor="phone"
                    className="mb-2 block text-sm font-medium"
                  >
                    Mobile number
                  </label>

                  <div className="flex h-13 overflow-hidden rounded-xl border border-[#d9e3d9] focus-within:border-[#176b52] focus-within:ring-2 focus-within:ring-[#176b52]/10">
                    <span className="flex items-center border-r border-[#e1e8e1] bg-[#f5f7f4] px-4 text-sm">
                      +91
                    </span>

                    <input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={10}
                      value={phone}
                      onChange={(e) =>
                        setPhone(e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="10-digit mobile number"
                      className="min-w-0 flex-1 px-4 text-base outline-none"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="otp"
                    className="mb-2 block text-sm font-medium"
                  >
                    Verification code
                  </label>

                  <input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, ""))
                    }
                    placeholder="Enter 6-digit OTP"
                    className="h-13 w-full rounded-xl border border-[#d9e3d9] px-4 text-center text-xl tracking-[0.3em] outline-none focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/10"
                    required
                  />

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setStep("phone");
                        setOtp("");
                        setError("");
                        setNotice("");
                        setCooldown(0);
                      }}
                      className="flex min-h-11 items-center gap-1 text-sm font-medium text-[#176b52] disabled:opacity-50"
                    >
                      <ArrowLeft size={15} />
                      Change number
                    </button>

                    <button
                      type="button"
                      disabled={busy || cooldown > 0}
                      onClick={() => void resendCode()}
                      className="min-h-11 text-sm font-medium text-[#176b52] disabled:text-[#8a9a8d]"
                    >
                      {cooldown > 0
                        ? `Resend in ${cooldown}s`
                        : "Resend OTP"}
                    </button>
                  </div>
                </div>
              )}

              {notice && (
                <p
                  role="status"
                  className="rounded-lg bg-[#edf5ef] p-3 text-sm text-[#176b52]"
                >
                  {notice}
                </p>
              )}

              {error && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#176b52] px-5 font-semibold text-white hover:bg-[#12543f] disabled:opacity-60"
              >
                {busy
                  ? "Please wait..."
                  : step === "phone"
                    ? "Continue"
                    : "Verify and sign in"}

                {!busy && <ArrowRight size={18} />}
              </button>
            </form>

            <div className="mt-6 flex items-start gap-2 border-t border-[#edf0ec] pt-5">
              <ShieldCheck
                size={18}
                className="mt-0.5 shrink-0 text-[#176b52]"
              />
              <p className="text-xs leading-5 text-[#718076]">
                Access is limited to registered retailers, field sales staff and authorized distributor staff.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
