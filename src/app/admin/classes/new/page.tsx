"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const PREDEFINED_CLASS_TYPES = [
  "Reformer Pilates",
  "Mat Pilates",
  "Beginner Pilates",
  "Intermediate Pilates",
  "Advanced Pilates",
  "Tower Pilates",
  "Cadillac Pilates",
  "Chair Pilates",
  "Barrel Pilates",
  "Prenatal Pilates",
  "Postnatal Pilates",
  "Senior Pilates",
  "Therapeutic / Rehab Pilates",
  "Private Session",
  "Duet Session",
  "Small Group Reformer",
  "Stretch & Mobility",
  "Core & Strength Pilates",
  "Pilates + Cardio",
  "Pilates Fusion",
  "Athletic Pilates"
];

export default function CreateClassPage() {
  const [title, setTitle] = useState("");
  const [instructor, setInstructor] = useState("");
  const [classDate, setClassDate] = useState("");
  const [classTime, setClassTime] = useState("");
  const [maxCapacity, setMaxCapacity] = useState("");
  const [classTypes, setClassTypes] = useState<string[]>(PREDEFINED_CLASS_TYPES);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function fetchClassTypes() {
      const { data, error } = await supabase
        .from("class_types")
        .select("name")
        .order("name", { ascending: true });
      if (!error && data && data.length > 0) {
        setClassTypes(data.map((d: any) => d.name));
      }
    }
    fetchClassTypes();
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const capacity = parseInt(maxCapacity);
    if (isNaN(capacity) || capacity <= 0) {
      setError("Capacity must be a positive number.");
      setLoading(false);
      return;
    }

    const { data: insertData, error: insertError } = await supabase
      .from("classes")
      .insert({
        title,
        instructor,
        class_date: classDate,
        class_time: classTime,
        max_capacity: capacity,
      })
      .select();

    if (insertError) {
      setError(insertError.message);
      setLoading(false);
      return;
    }

    if (!insertData || insertData.length === 0) {
      setError("Class was not created. No data returned from database.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    setTimeout(() => {
      router.push("/admin/classes");
    }, 1500);
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-light text-brand-navy">
          Create <span className="font-medium">Class</span>
        </h1>
        <p className="text-sm text-brand-navy/50 mt-1">
          Add a new class to the schedule
        </p>
      </div>

      {success && (
        <div className="mb-6 p-4 rounded-xl bg-brand-success/10 border border-brand-success/20 text-brand-success text-sm flex items-center gap-2">
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          Class created successfully! Redirecting...
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-lg shadow-brand-navy/5 p-8 border border-brand-sand/50">
        {error && (
          <div className="mb-6 p-3 rounded-lg bg-brand-error/10 border border-brand-error/20 text-brand-error text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">
              Class Type
            </label>
            <select
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-brown transition-all text-sm"
            >
              <option value="" disabled>Select Class Type</option>
              {classTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">
              Instructor Name
            </label>
            <input
              type="text"
              value={instructor}
              onChange={(e) => setInstructor(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy placeholder:text-brand-navy/30 transition-all"
              placeholder="e.g. Sarah"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">
                Date
              </label>
              <input
                type="date"
                value={classDate}
                onChange={(e) => setClassDate(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">
                Time
              </label>
              <input
                type="time"
                value={classTime}
                onChange={(e) => setClassTime(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-navy/70 mb-1.5">
              Maximum Members
            </label>
            <input
              type="number"
              value={maxCapacity}
              onChange={(e) => setMaxCapacity(e.target.value)}
              required
              min="1"
              className="w-full px-4 py-3 rounded-xl border border-brand-sand bg-brand-cream/50 text-brand-navy placeholder:text-brand-navy/30 transition-all"
              placeholder="e.g. 12"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 rounded-xl border border-brand-sand text-brand-navy/60 font-medium hover:bg-brand-beige transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 rounded-xl bg-brand-brown text-white font-medium hover:bg-brand-brown-dark transition-colors disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Class"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
