"use client";

import { type ReactNode, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChartBar,
  CircleAlert,
  Database,
  Dumbbell,
  Gauge,
  LoaderCircle,
  type LucideIcon,
  Sigma,
  Target,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

type AnalyticsRoutine = {
  id: string;
  name: string;
};

type AnalyticsExercise = {
  id: string;
  name: string;
  muscle_group: string | null;
};

export type AnalyticsWorkout = {
  id: string;
  routine_id: string;
  start_time: string;
  end_time: string;
  routines: AnalyticsRoutine | AnalyticsRoutine[] | null;
};

export type AnalyticsWorkoutSet = {
  workout_id: string;
  exercise_id: string;
  set_number: number;
  weight_lbs: number;
  reps: number;
  created_at: string;
  exercises: AnalyticsExercise | AnalyticsExercise[] | null;
};

type WorkoutAnalyticsProps = {
  workouts: AnalyticsWorkout[];
  workoutSets: AnalyticsWorkoutSet[];
  initialError: string | null;
};

type IntensityPoint = {
  workoutId: string;
  date: string;
  fullDate: string;
  actualPr: number;
  predictedOneRepMax: number;
};

type VolumePoint = {
  workoutId: string;
  date: string;
  fullDate: string;
  routine: string;
  tonnage: number;
};

type FrequencyPoint = {
  dayIndex: number;
  day: string;
  hour: number;
  hourLabel: string;
  sessions: number;
};

type DistributionPoint = {
  name: string;
  value: number;
  percentage: number;
};

const chartColors = [
  "#a78bfa",
  "#22d3ee",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#60a5fa",
  "#f472b6",
];
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const axisColor = "rgba(255,255,255,0.34)";
const gridColor = "rgba(255,255,255,0.07)";
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const fullDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

function getJoinedRoutine(
  routine: AnalyticsWorkout["routines"],
) {
  return Array.isArray(routine) ? (routine[0] ?? null) : routine;
}

function getJoinedExercise(
  exercise: AnalyticsWorkoutSet["exercises"],
) {
  return Array.isArray(exercise)
    ? (exercise[0] ?? null)
    : exercise;
}

function calculateBrzyckiOneRepMax(weight: number, reps: number) {
  if (
    !Number.isFinite(weight) ||
    weight <= 0 ||
    !Number.isInteger(reps) ||
    reps < 1 ||
    reps >= 37
  ) {
    return null;
  }

  return weight * (36 / (37 - reps));
}

function getHourLabel(hour: number) {
  const normalizedHour = Math.floor(hour);
  const suffix = normalizedHour >= 12 ? "PM" : "AM";
  const displayHour = normalizedHour % 12 || 12;

  return `${displayHour}:00 ${suffix}`;
}

function formatTooltipValue(value: number | string | readonly (number | string)[]) {
  if (typeof value === "number") {
    return numberFormatter.format(value);
  }

  return Array.isArray(value) ? value.join(" – ") : value;
}

function MetricTooltip({
  active,
  payload,
  label,
}: TooltipContentProps) {
  if (!active || payload.length === 0) {
    return null;
  }

  const rawPoint = payload[0]?.payload as
    | { fullDate?: string }
    | undefined;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-xs shadow-2xl backdrop-blur-xl">
      <p className="font-medium text-white/75">
        {rawPoint?.fullDate ?? label}
      </p>
      <div className="mt-2 space-y-1.5">
        {payload.map((entry) => (
          <div
            key={`${entry.dataKey?.toString()}-${entry.name?.toString()}`}
            className="flex items-center justify-between gap-5"
          >
            <span
              className="flex items-center gap-2 text-white/45"
              style={{ color: entry.color }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-mono font-semibold text-white">
              {entry.value === undefined
                ? "—"
                : formatTooltipValue(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FrequencyTooltip({
  active,
  payload,
}: TooltipContentProps) {
  if (!active || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload as FrequencyPoint | undefined;

  if (!point) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-xs shadow-2xl backdrop-blur-xl">
      <p className="font-medium text-white">
        {point.day} · {point.hourLabel}
      </p>
      <p className="mt-1 text-white/45">
        {point.sessions}{" "}
        {point.sessions === 1 ? "session" : "sessions"}
      </p>
    </div>
  );
}

function DistributionTooltip({
  active,
  payload,
}: TooltipContentProps) {
  if (!active || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload as DistributionPoint | undefined;

  if (!point) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-xs shadow-2xl backdrop-blur-xl">
      <p className="font-medium text-white">{point.name}</p>
      <p className="mt-1 text-white/45">
        {numberFormatter.format(point.value)} lb ·{" "}
        {numberFormatter.format(point.percentage)}%
      </p>
    </div>
  );
}

export function WorkoutAnalytics({
  workouts,
  workoutSets,
  initialError,
}: WorkoutAnalyticsProps) {
  const router = useRouter();
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedFeedback, setSeedFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const workoutById = useMemo(
    () => new Map(workouts.map((workout) => [workout.id, workout])),
    [workouts],
  );
  const analytics = useMemo(() => {
    const validSets = workoutSets.filter(
      (set) =>
        Number.isFinite(Number(set.weight_lbs)) &&
        Number(set.weight_lbs) >= 0 &&
        Number.isInteger(Number(set.reps)) &&
        Number(set.reps) > 0,
    );
    const totalTonnage = validSets.reduce(
      (total, set) =>
        total + Number(set.weight_lbs) * Number(set.reps),
      0,
    );
    const exerciseCounts = new Map<
      string,
      { id: string; name: string; count: number }
    >();

    for (const set of validSets) {
      const exercise = getJoinedExercise(set.exercises);

      if (!exercise) {
        continue;
      }

      const current = exerciseCounts.get(exercise.id);
      exerciseCounts.set(exercise.id, {
        id: exercise.id,
        name: exercise.name,
        count: (current?.count ?? 0) + 1,
      });
    }

    const exerciseOptions = [...exerciseCounts.values()].sort(
      (first, second) =>
        second.count - first.count ||
        first.name.localeCompare(second.name),
    );
    const volumeByWorkout = new Map<string, number>();

    for (const set of validSets) {
      volumeByWorkout.set(
        set.workout_id,
        (volumeByWorkout.get(set.workout_id) ?? 0) +
          Number(set.weight_lbs) * Number(set.reps),
      );
    }

    const volumeData: VolumePoint[] = workouts.map((workout) => ({
      workoutId: workout.id,
      date: dateFormatter.format(new Date(workout.start_time)),
      fullDate: fullDateFormatter.format(
        new Date(workout.start_time),
      ),
      routine:
        getJoinedRoutine(workout.routines)?.name ??
        "Untitled routine",
      tonnage: Math.round(volumeByWorkout.get(workout.id) ?? 0),
    }));
    const frequencyBuckets = new Map<string, FrequencyPoint>();

    for (const workout of workouts) {
      const startedAt = new Date(workout.start_time);
      const dayIndex = startedAt.getDay();
      const hour = startedAt.getHours();
      const key = `${dayIndex}:${hour}`;
      const current = frequencyBuckets.get(key);

      frequencyBuckets.set(key, {
        dayIndex,
        day: dayNames[dayIndex],
        hour,
        hourLabel: getHourLabel(hour),
        sessions: (current?.sessions ?? 0) + 1,
      });
    }

    const routineTonnage = new Map<string, number>();

    for (const set of validSets) {
      const workout = workoutById.get(set.workout_id);
      const routineName =
        getJoinedRoutine(workout?.routines ?? null)?.name ??
        "Unassigned";
      routineTonnage.set(
        routineName,
        (routineTonnage.get(routineName) ?? 0) +
          Number(set.weight_lbs) * Number(set.reps),
      );
    }

    const distributionTotal = [...routineTonnage.values()].reduce(
      (total, value) => total + value,
      0,
    );
    const distributionData: DistributionPoint[] = [
      ...routineTonnage.entries(),
    ]
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value: Math.round(value),
        percentage:
          distributionTotal > 0
            ? Math.round((value / distributionTotal) * 1000) / 10
            : 0,
      }))
      .sort((first, second) => second.value - first.value);

    return {
      validSets,
      totalTonnage,
      averageSetsPerWorkout:
        workouts.length > 0
          ? validSets.length / workouts.length
          : 0,
      exerciseOptions,
      volumeData,
      frequencyData: [...frequencyBuckets.values()].sort(
        (first, second) =>
          first.dayIndex - second.dayIndex ||
          first.hour - second.hour,
      ),
      distributionData,
    };
  }, [workoutById, workoutSets, workouts]);
  const [selectedExerciseId, setSelectedExerciseId] = useState<
    string | null
  >(null);
  const activeExerciseId =
    selectedExerciseId ?? analytics.exerciseOptions[0]?.id ?? "";
  const intensityData = useMemo(() => {
    const sessionMaximums = new Map<
      string,
      { actual: number; predicted: number }
    >();

    for (const set of analytics.validSets) {
      if (set.exercise_id !== activeExerciseId) {
        continue;
      }

      const weight = Number(set.weight_lbs);
      const estimate = calculateBrzyckiOneRepMax(
        weight,
        Number(set.reps),
      );
      const current = sessionMaximums.get(set.workout_id) ?? {
        actual: 0,
        predicted: 0,
      };

      current.actual = Math.max(current.actual, weight);

      if (estimate !== null) {
        current.predicted = Math.max(current.predicted, estimate);
      }

      sessionMaximums.set(set.workout_id, current);
    }

    let runningActualPr = 0;
    let runningPredictedPr = 0;
    const points: IntensityPoint[] = [];

    for (const workout of workouts) {
      const maximums = sessionMaximums.get(workout.id);

      if (!maximums) {
        continue;
      }

      runningActualPr = Math.max(
        runningActualPr,
        maximums.actual,
      );
      runningPredictedPr = Math.max(
        runningPredictedPr,
        maximums.predicted,
      );
      points.push({
        workoutId: workout.id,
        date: dateFormatter.format(new Date(workout.start_time)),
        fullDate: fullDateFormatter.format(
          new Date(workout.start_time),
        ),
        actualPr: Math.round(runningActualPr * 10) / 10,
        predictedOneRepMax:
          Math.round(runningPredictedPr * 10) / 10,
      });
    }

    return points;
  }, [activeExerciseId, analytics.validSets, workouts]);
  const peakActualPr = intensityData.reduce(
    (peak, point) => Math.max(peak, point.actualPr),
    0,
  );
  const peakPredictedOneRepMax = intensityData.reduce(
    (peak, point) => Math.max(peak, point.predictedOneRepMax),
    0,
  );
  const summaryCards = [
    {
      label: "Total tonnage",
      value: `${compactNumberFormatter.format(analytics.totalTonnage)} lb`,
      detail: "Σ(weight × reps), all completed sets",
      icon: Sigma,
      color: "text-violet-300",
    },
    {
      label: "Completed workouts",
      value: numberFormatter.format(workouts.length),
      detail: "Sessions with a recorded end time",
      icon: Dumbbell,
      color: "text-cyan-300",
    },
    {
      label: "Average sets",
      value: numberFormatter.format(
        analytics.averageSetsPerWorkout,
      ),
      detail: "Completed sets ÷ completed workouts",
      icon: Gauge,
      color: "text-emerald-300",
    },
  ];

  const generateTestData = async () => {
    if (isSeeding) {
      return;
    }

    setIsSeeding(true);
    setSeedFeedback(null);

    try {
      const response = await fetch("/api/seed-analytics", {
        method: "POST",
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.detail ??
            result.error ??
            "Unable to generate analytics test data.",
        );
      }

      setSeedFeedback({
        type: "success",
        message: result.message ?? "Test data generated.",
      });
      router.refresh();
    } catch (error) {
      setSeedFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to generate analytics test data.",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  return (
    <main className="relative min-h-screen text-white">
      <div className="pointer-events-none absolute -left-40 top-12 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-64 h-96 w-96 rounded-full bg-cyan-400/[0.07] blur-3xl" />

      <div className="relative">
        <header>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/55 backdrop-blur-lg">
            <Activity className="h-3.5 w-3.5 text-violet-300" />
            Training intelligence
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Workout Analytics
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/45 sm:text-base">
                A multidimensional view of mechanical work, estimated
                strength, training frequency, and effort allocation.
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              <button
                type="button"
                onClick={generateTestData}
                disabled={isSeeding}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-violet-300/20 bg-violet-300/10 px-3.5 text-xs font-semibold text-violet-100 shadow-lg shadow-violet-950/20 transition hover:border-violet-300/30 hover:bg-violet-300/15 disabled:cursor-wait disabled:opacity-60"
              >
                {isSeeding ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Database className="h-4 w-4" />
                )}
                {isSeeding ? "Generating…" : "Generate Test Data"}
              </button>
              <div className="flex items-center gap-2 text-xs text-white/35">
                <CalendarDays className="h-4 w-4" />
                All completed training
              </div>
              {seedFeedback ? (
                <p
                  role={seedFeedback.type === "error" ? "alert" : "status"}
                  aria-live="polite"
                  className={`flex max-w-sm items-start gap-1.5 text-xs leading-5 ${
                    seedFeedback.type === "error"
                      ? "text-red-300"
                      : "text-emerald-300"
                  }`}
                >
                  {seedFeedback.type === "error" ? (
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  {seedFeedback.message}
                </p>
              ) : null}
            </div>
          </div>
        </header>

        {initialError ? (
          <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-100 backdrop-blur-lg">
            Some analytics data could not be loaded: {initialError}
          </div>
        ) : null}

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          {summaryCards.map(({ label, value, detail, icon: Icon, color }) => (
            <article
              key={label}
              className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/20 backdrop-blur-xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/35">
                    {label}
                  </p>
                  <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                    {value}
                  </p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/5">
                  <Icon className={`h-4.5 w-4.5 ${color}`} />
                </span>
              </div>
              <p className="mt-4 text-xs leading-5 text-white/30">
                {detail}
              </p>
            </article>
          ))}
        </section>

        {workouts.length === 0 ? (
          <section className="mt-6 grid min-h-96 place-items-center rounded-3xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-lg">
            <div className="max-w-sm">
              <ChartBar className="mx-auto h-8 w-8 text-white/25" />
              <h2 className="mt-4 text-lg font-semibold">
                Complete a workout to unlock analytics
              </h2>
              <p className="mt-2 text-sm leading-6 text-white/40">
                Volume, intensity, frequency, and distribution models
                will populate from your logged sets.
              </p>
            </div>
          </section>
        ) : (
          <section className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">
            <ChartCard
              icon={TrendingUp}
              eyebrow="Intensity"
              title="Strength PR progression"
              description="Actual max load versus Brzycki-predicted 1RM"
              action={
                <label className="relative">
                  <span className="sr-only">Exercise</span>
                  <select
                    value={activeExerciseId}
                    onChange={(event) =>
                      setSelectedExerciseId(event.target.value)
                    }
                    className="h-10 max-w-44 rounded-xl border border-white/10 bg-neutral-900 px-3 text-xs font-medium text-white/70 outline-none transition focus:border-violet-300/40"
                  >
                    {analytics.exerciseOptions.map((exercise) => (
                      <option key={exercise.id} value={exercise.id}>
                        {exercise.name}
                      </option>
                    ))}
                  </select>
                </label>
              }
              metric={
                peakActualPr > 0
                  ? `Actual ${numberFormatter.format(peakActualPr)} lb · Predicted ${numberFormatter.format(peakPredictedOneRepMax)} lb`
                  : undefined
              }
            >
              {intensityData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={intensityData}
                    margin={{ top: 12, right: 12, left: -14, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke={gridColor}
                      strokeDasharray="3 5"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: axisColor, fontSize: 11 }}
                      minTickGap={24}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: axisColor, fontSize: 11 }}
                      width={56}
                      tickFormatter={(value) => `${value} lb`}
                    />
                    <Tooltip
                      content={MetricTooltip}
                      cursor={{
                        stroke: "rgba(167,139,250,0.35)",
                        strokeDasharray: "4 4",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={7}
                      formatter={(value) => (
                        <span className="text-xs text-white/45">
                          {value}
                        </span>
                      )}
                    />
                    <Line
                      type="monotone"
                      dataKey="actualPr"
                      name="Actual PR"
                      stroke="#22d3ee"
                      strokeWidth={2.5}
                      dot={{
                        r: 3.5,
                        fill: "#0a0a0a",
                        stroke: "#67e8f9",
                        strokeWidth: 2,
                      }}
                      activeDot={{ r: 5, fill: "#67e8f9" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="predictedOneRepMax"
                      name="Predicted 1RM"
                      stroke="#a78bfa"
                      strokeDasharray="6 4"
                      strokeWidth={2.5}
                      dot={{
                        r: 3.5,
                        fill: "#0a0a0a",
                        stroke: "#c4b5fd",
                        strokeWidth: 2,
                      }}
                      activeDot={{ r: 5, fill: "#c4b5fd" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="Log weighted sets below 37 reps to calculate Brzycki estimates." />
              )}
            </ChartCard>

            <ChartCard
              icon={ChartBar}
              eyebrow="Volume"
              title="Tonnage by workout"
              description="Total mechanical load performed each session"
              metric={`${analytics.volumeData.length} sessions`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={analytics.volumeData}
                  margin={{ top: 12, right: 10, left: -12, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke={gridColor}
                    strokeDasharray="3 5"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: axisColor, fontSize: 11 }}
                    minTickGap={24}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: axisColor, fontSize: 11 }}
                    width={52}
                    tickFormatter={(value) =>
                      compactNumberFormatter.format(Number(value))
                    }
                  />
                  <Tooltip
                    content={MetricTooltip}
                    cursor={{ fill: "rgba(255,255,255,0.035)" }}
                  />
                  <Bar
                    dataKey="tonnage"
                    name="Tonnage (lb)"
                    fill="#22d3ee"
                    fillOpacity={0.72}
                    radius={[7, 7, 2, 2]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              icon={CalendarDays}
              eyebrow="Frequency"
              title="Training consistency"
              description="Session density by weekday and local start time"
              metric={`${analytics.frequencyData.length} active time blocks`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart
                  margin={{ top: 12, right: 16, left: -12, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke={gridColor}
                    strokeDasharray="3 5"
                  />
                  <XAxis
                    type="number"
                    dataKey="dayIndex"
                    domain={[0, 6]}
                    ticks={[0, 1, 2, 3, 4, 5, 6]}
                    tickFormatter={(value) => dayNames[value] ?? ""}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: axisColor, fontSize: 11 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="hour"
                    domain={[0, 23]}
                    ticks={[0, 6, 12, 18, 23]}
                    tickFormatter={(value) => getHourLabel(value)}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: axisColor, fontSize: 10 }}
                    width={62}
                  />
                  <ZAxis
                    type="number"
                    dataKey="sessions"
                    range={[90, 520]}
                  />
                  <Tooltip content={FrequencyTooltip} cursor={false} />
                  <Scatter
                    name="Sessions"
                    data={analytics.frequencyData}
                    fill="#34d399"
                    fillOpacity={0.7}
                    stroke="#6ee7b7"
                    strokeWidth={1.5}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              icon={Target}
              eyebrow="Distribution"
              title="Effort allocation"
              description="Percentage of total tonnage grouped by routine"
              metric={`${analytics.distributionData.length} routines`}
            >
              {analytics.distributionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.distributionData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="45%"
                      innerRadius="48%"
                      outerRadius="72%"
                      paddingAngle={3}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth={1}
                    >
                      {analytics.distributionData.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={chartColors[index % chartColors.length]}
                          fillOpacity={0.78}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={DistributionTooltip} />
                    <Legend
                      iconType="circle"
                      iconSize={7}
                      formatter={(value) => (
                        <span className="text-xs text-white/45">
                          {value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty message="Log weighted sets to calculate routine distribution." />
              )}
            </ChartCard>
          </section>
        )}
      </div>
    </main>
  );
}

type ChartCardProps = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  metric?: string;
  children: ReactNode;
};

function ChartCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  metric,
  children,
}: ChartCardProps) {
  return (
    <article className="min-w-0 rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 text-violet-300">
            <Icon className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/30">
              {eyebrow}
            </p>
            <h2 className="mt-1 truncate text-base font-semibold text-white/90 sm:text-lg">
              {title}
            </h2>
            <p className="mt-1 text-xs leading-5 text-white/35">
              {description}
            </p>
          </div>
        </div>
        {action}
      </div>
      {metric ? (
        <p className="mt-4 font-mono text-xs text-white/40">{metric}</p>
      ) : null}
      <div className="mt-3 h-80 min-w-0">{children}</div>
    </article>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="grid h-full place-items-center rounded-2xl border border-dashed border-white/10 bg-black/10 p-6 text-center">
      <div className="max-w-xs">
        <TrendingUp className="mx-auto h-6 w-6 text-white/20" />
        <p className="mt-3 text-sm leading-6 text-white/35">
          {message}
        </p>
      </div>
    </div>
  );
}
