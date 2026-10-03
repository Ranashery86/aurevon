"use client";

import { useEffect, useState } from "react";
import { btnPrimary, btnSecondary } from "@/lib/ui";
import { callDomainMonitor, errorMessage } from "./api";
import { Label, Modal, Spinner, Toggle, cx, inputClass } from "./ui";
import type { MonitorSettings } from "./types";

const DEFAULT_SETTINGS: MonitorSettings = {
  alert_days: [60, 30, 14, 7, 3, 1, 0],
  notify_emails: [],
  email_enabled: false,
  check_hour: 9,
  timezone: "Asia/Karachi",
};

const MAX_NOTIFY_EMAILS = 30;

const TIMEZONE_OPTIONS = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

export function SettingsModal({
  onClose,
  onSuccess,
  onError,
}: {
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [settings, setSettings] = useState<MonitorSettings>(DEFAULT_SETTINGS);
  const [daysInput, setDaysInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    callDomainMonitor<{ settings: MonitorSettings }>({ action: "get_settings" })
      .then((response) => {
        if (cancelled) return;
        const incoming = response.settings ?? DEFAULT_SETTINGS;
        setSettings({
          ...DEFAULT_SETTINGS,
          ...incoming,
          alert_days: Array.isArray(incoming.alert_days)
            ? incoming.alert_days
            : DEFAULT_SETTINGS.alert_days,
          notify_emails: Array.isArray(incoming.notify_emails)
            ? incoming.notify_emails
            : [],
        });
      })
      .catch((error) => {
        if (!cancelled) {
          onError(errorMessage(error, "Could not load the monitor settings."));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onError]);

  const addAlertDay = (raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;

    const day = Math.round(value);
    if (settings.alert_days.includes(day)) return;

    setSettings((prev) => ({
      ...prev,
      alert_days: [...prev.alert_days, day].sort((a, b) => b - a),
    }));
    setDaysInput("");
  };

  const removeAlertDay = (day: number) => {
    setSettings((prev) => ({
      ...prev,
      alert_days: prev.alert_days.filter((entry) => entry !== day),
    }));
  };

  const addEmail = () => {
    const email = emailInput.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (settings.notify_emails.includes(email)) {
      setEmailInput("");
      return;
    }
    if (settings.notify_emails.length >= MAX_NOTIFY_EMAILS) return;

    setSettings((prev) => ({
      ...prev,
      notify_emails: [...prev.notify_emails, email],
    }));
    setEmailInput("");
  };

  const removeEmail = (email: string) => {
    setSettings((prev) => ({
      ...prev,
      notify_emails: prev.notify_emails.filter((entry) => entry !== email),
    }));
  };

  const handleSave = async () => {
    if (saving || loading) return;

    setSaving(true);
    try {
      const response = await callDomainMonitor<{ settings: MonitorSettings }>({
        action: "save_settings",
        alert_days: settings.alert_days,
        notify_emails: settings.notify_emails,
        email_enabled: settings.email_enabled,
        check_hour: settings.check_hour,
        timezone: settings.timezone.trim() || DEFAULT_SETTINGS.timezone,
      });

      const incoming = response.settings ?? settings;
      setSettings({ ...settings, ...incoming });
      onSuccess("Monitor settings saved.");
      onClose();
    } catch (error) {
      onError(errorMessage(error, "Could not save the monitor settings."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      onClose={saving ? () => undefined : onClose}
      title="Monitor settings"
      subtitle="Choose when your domains are checked and when you hear about them."
      wide
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className={`${btnSecondary} px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-50`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className={cx(
              btnPrimary,
              "px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            {saving && <Spinner />}
            {saving ? "Saving…" : "Save settings"}
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Spinner className="text-accent" />
          Loading settings…
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <Label htmlFor="alert-days" hint="Days before expiry that trigger an alert">
              Alert days
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {settings.alert_days.length === 0 && (
                <p className="text-sm text-slate-500">No alert days set.</p>
              )}
              {settings.alert_days.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => removeAlertDay(day)}
                  title={`Remove ${day}`}
                  className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent-deep ring-1 ring-accent/20 transition-colors hover:bg-blush"
                >
                  {day === 0 ? "today" : `${day}d`}
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
            <form
              className="mt-2.5 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                addAlertDay(daysInput);
              }}
            >
              <input
                id="alert-days"
                type="number"
                min={0}
                inputMode="numeric"
                value={daysInput}
                onChange={(event) => setDaysInput(event.target.value)}
                placeholder="e.g. 45"
                className={cx(inputClass, "max-w-32")}
              />
              <button
                type="submit"
                className="shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-deep"
              >
                Add
              </button>
            </form>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-2xl bg-mist/50 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy">Email alerts</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Send alerts to the addresses below.
              </p>
            </div>
            <Toggle
              checked={settings.email_enabled}
              onChange={(next) =>
                setSettings((prev) => ({ ...prev, email_enabled: next }))
              }
              label="Email alerts"
            />
          </div>

          <div>
            <Label
              htmlFor="notify-emails"
              hint={`Up to ${MAX_NOTIFY_EMAILS} recipients`}
            >
              Notify emails
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {settings.notify_emails.length === 0 && (
                <p className="text-sm text-slate-500">No recipients yet.</p>
              )}
              {settings.notify_emails.map((email) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => removeEmail(email)}
                  title={`Remove ${email}`}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy ring-1 ring-navy/10 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  {email}
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
            <form
              className="mt-2.5 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                addEmail();
              }}
            >
              <input
                id="notify-emails"
                type="email"
                value={emailInput}
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder="you@company.com"
                className={inputClass}
              />
              <button
                type="submit"
                disabled={
                  !emailInput.trim() ||
                  settings.notify_emails.length >= MAX_NOTIFY_EMAILS
                }
                className="shrink-0 rounded-full bg-navy px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-deep disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add
              </button>
            </form>
            {settings.notify_emails.length >= MAX_NOTIFY_EMAILS && (
              <p className="mt-1.5 text-xs text-slate-500">
                You have reached the maximum of {MAX_NOTIFY_EMAILS}{" "}
                notification emails.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="check-hour" hint="Server time, 0 = midnight">
                Daily check hour
              </Label>
              <select
                id="check-hour"
                value={settings.check_hour}
                onChange={(event) =>
                  setSettings((prev) => ({
                    ...prev,
                    check_hour: Number(event.target.value),
                  }))
                }
                className={inputClass}
              >
                {Array.from({ length: 24 }).map((_, hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="check-timezone" hint="IANA timezone name">
                Timezone
              </Label>
              <input
                id="check-timezone"
                list="domain-monitor-timezones"
                value={settings.timezone}
                onChange={(event) =>
                  setSettings((prev) => ({ ...prev, timezone: event.target.value }))
                }
                className={inputClass}
              />
              <datalist id="domain-monitor-timezones">
                {TIMEZONE_OPTIONS.map((zone) => (
                  <option key={zone} value={zone} />
                ))}
              </datalist>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}