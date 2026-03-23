"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserSupabaseClient, hasSupabaseEnv } from "@/lib/supabase";

type AuthMode = "signin" | "signup";
type UserSession = {
  id: string;
  email: string;
  mode: "demo" | "supabase";
};

type Task = {
  id: string;
  title: string;
  is_complete: boolean;
  created_at: string;
};

const STORAGE_KEYS = {
  user: "taskflow-next-user",
  tasks: "taskflow-next-tasks",
};

const DEMO_TASKS: Task[] = [
  createTask("Review the first real-stack TaskFlow build"),
  createTask("Share design direction on the dashboard finish", true),
];

export default function Home() {
  const [supabase] = useState(() => createBrowserSupabaseClient());
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [session, setSession] = useState<UserSession | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const hasSupabase = hasSupabaseEnv && Boolean(supabase);

  const loadSupabaseTasks = useCallback(async (userId: string) => {
    const client = supabase;

    if (!client) {
      return;
    }

    const { data, error } = await client
      .from("tasks")
      .select("id, title, is_complete, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(error.message);
      return;
    }

    setTasks(sortTasks(data ?? []));
  }, [supabase]);

  const restoreDemoState = useCallback(() => {
    const savedUser = window.localStorage.getItem(STORAGE_KEYS.user);
    const savedTasks = window.localStorage.getItem(STORAGE_KEYS.tasks);

    if (savedUser) {
      setSession(JSON.parse(savedUser) as UserSession);
    }

    if (savedTasks) {
      setTasks(sortTasks(JSON.parse(savedTasks) as Task[]));
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      const restoreHandle = window.setTimeout(() => {
        restoreDemoState();
      }, 0);

      return () => {
        window.clearTimeout(restoreHandle);
      };
    }

    const client = supabase;

    let active = true;

    async function restoreSupabaseSession() {
      const {
        data: { session: authSession },
      } = await client.auth.getSession();

      if (!active) {
        return;
      }

      if (authSession?.user) {
        const nextSession = {
          id: authSession.user.id,
          email: authSession.user.email ?? "Signed in user",
          mode: "supabase" as const,
        };

        setSession(nextSession);
        await loadSupabaseTasks(nextSession.id);
      } else {
        restoreDemoState();
      }
    }

    restoreSupabaseSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, authSession) => {
      if (!active) {
        return;
      }

      if (authSession?.user) {
        const nextSession = {
          id: authSession.user.id,
          email: authSession.user.email ?? "Signed in user",
          mode: "supabase" as const,
        };

        setSession(nextSession);
        void loadSupabaseTasks(nextSession.id);
      } else {
        setSession(null);
        setTasks([]);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadSupabaseTasks, restoreDemoState, supabase]);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim() || password.trim().length < 6) {
      setMessage("Use a valid email and a password with at least 6 characters.");
      return;
    }

    setIsBusy(true);
    setMessage("");

    if (!supabase) {
      const demoSession = {
        id: "demo-user",
        email: email.trim(),
        mode: "demo" as const,
      };

      setSession(demoSession);
      window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(demoSession));

      const existingTasks = window.localStorage.getItem(STORAGE_KEYS.tasks);
      if (!existingTasks) {
        window.localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(DEMO_TASKS));
        setTasks(sortTasks(DEMO_TASKS));
      }

      setMessage("Signed in using demo mode.");
      setIsBusy(false);
      return;
    }

    const response =
      authMode === "signin"
        ? await supabase.auth.signInWithPassword({
            email: email.trim(),
            password: password.trim(),
          })
        : await supabase.auth.signUp({
            email: email.trim(),
            password: password.trim(),
          });

    if (response.error) {
      setMessage(response.error.message);
      setIsBusy(false);
      return;
    }

    if (authMode === "signup") {
      setMessage("Account created. Check your email to confirm, then sign in.");
      setAuthMode("signin");
      setPassword("");
    } else {
      setMessage("");
    }

    setIsBusy(false);
  }

  function handleDemoLogin() {
    const demoSession = {
      id: "demo-user",
      email: "demo@taskflow.test",
      mode: "demo" as const,
    };

    setSession(demoSession);
    setMessage("Demo mode ready.");
    window.localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(demoSession));

    const savedTasks = window.localStorage.getItem(STORAGE_KEYS.tasks);
    if (savedTasks) {
      setTasks(sortTasks(JSON.parse(savedTasks) as Task[]));
      return;
    }

    window.localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(DEMO_TASKS));
    setTasks(sortTasks(DEMO_TASKS));
  }

  async function handleAddTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!taskTitle.trim() || !session) {
      return;
    }

    setIsBusy(true);
    setMessage("");

    if (session.mode === "supabase" && supabase) {
      const { error } = await supabase.from("tasks").insert({
        title: taskTitle.trim(),
        is_complete: false,
        user_id: session.id,
      });

      if (error) {
        setMessage(error.message);
        setIsBusy(false);
        return;
      }

      await loadSupabaseTasks(session.id);
    } else {
      const nextTasks = sortTasks([createTask(taskTitle.trim()), ...tasks]);
      setTasks(nextTasks);
      window.localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(nextTasks));
    }

    setTaskTitle("");
    setIsBusy(false);
  }

  async function handleTaskToggle(taskId: string) {
    if (!session) {
      return;
    }

    const targetTask = tasks.find((task) => task.id === taskId);

    if (!targetTask) {
      return;
    }

    if (session.mode === "supabase" && supabase) {
      const { error } = await supabase
        .from("tasks")
        .update({ is_complete: !targetTask.is_complete })
        .eq("id", taskId);

      if (error) {
        setMessage(error.message);
        return;
      }

      await loadSupabaseTasks(session.id);
      return;
    }

    const nextTasks = sortTasks(
      tasks.map((task) =>
        task.id === taskId ? { ...task, is_complete: !task.is_complete } : task
      )
    );

    setTasks(nextTasks);
    window.localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(nextTasks));
  }

  async function handleSignOut() {
    setMessage("");

    if (session?.mode === "supabase" && supabase) {
      await supabase.auth.signOut();
    }

    window.localStorage.removeItem(STORAGE_KEYS.user);
    setSession(null);
    setTasks([]);
  }

  const activeTasks = tasks.filter((task) => !task.is_complete).length;
  const completedTasks = tasks.length - activeTasks;

  return (
    <div className={`shell ${session ? "shell-authenticated" : "shell-guest"}`}>
      {!session ? (
        <>
          <section className="hero">
            <p className="eyebrow">TaskFlow</p>
            <h1>Personal task management that feels calm, not chaotic.</h1>
            <p className="hero-copy">
              A real-stack version of our team exercise. You can run in demo mode now
              or connect Supabase for live auth and task data.
            </p>
            <div className="status-badge">
              {hasSupabase ? "Supabase available" : "Demo mode active"}
            </div>
          </section>

          <section className="panel auth-panel">
            <div className="panel-heading">
              <p className="eyebrow">Welcome back</p>
              <h2>{authMode === "signin" ? "Sign in to TaskFlow" : "Create your account"}</h2>
              <p>
                {authMode === "signin"
                  ? "Start in demo mode now, or use your real account once Supabase is connected."
                  : "Set up a lightweight account for the first product pass."}
              </p>
            </div>

            <form className="stack-form" onSubmit={handleAuthSubmit}>
              <label className="field">
                <span>Email</span>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="designer@taskflow.test"
                  required
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  placeholder="Minimum 6 characters"
                  required
                />
              </label>
              <button className="button button-primary" disabled={isBusy} type="submit">
                {isBusy ? "Working..." : authMode === "signin" ? "Sign in" : "Create account"}
              </button>
            </form>

            <div className="inline-actions">
              <button
                className="button button-secondary"
                onClick={() => setAuthMode(authMode === "signin" ? "signup" : "signin")}
                type="button"
              >
                {authMode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
              </button>
              <button className="button button-ghost" onClick={handleDemoLogin} type="button">
                Continue in demo mode
              </button>
            </div>

            <p className="feedback">{message}</p>
          </section>
        </>
      ) : (
        <section className="panel dashboard-panel">
          <header className="dashboard-header">
            <div className="dashboard-intro">
              <p className="eyebrow">Dashboard</p>
              <h2>Your task list</h2>
              <p>
                Capture what matters, keep the list light, and move completed work
                out of the way.
              </p>
            </div>

            <div className="account-meta">
              <div className="user-chip">
                {session.mode === "demo" ? "Demo session" : session.email}
              </div>
              <button className="button button-secondary" onClick={handleSignOut} type="button">
                Sign out
              </button>
            </div>
          </header>

          <div className="summary-bar" aria-label="Task summary">
            <div className="summary-item">
              <span>Active</span>
              <strong>{activeTasks}</strong>
            </div>
            <div className="summary-item">
              <span>Completed</span>
              <strong>{completedTasks}</strong>
            </div>
            <p className="summary-total">
              {tasks.length === 1 ? "1 task total" : `${tasks.length} tasks total`}
            </p>
          </div>

          <form className="task-entry" onSubmit={handleAddTask}>
            <label className="field">
              <span>New task</span>
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                type="text"
                maxLength={120}
                placeholder="Add something you want to get done"
                required
              />
            </label>
            <button className="button button-primary" disabled={isBusy} type="submit">
              {isBusy ? "Adding..." : "Add task"}
            </button>
          </form>

          {tasks.length === 0 ? (
            <div className="empty-state">
              <h3>You&apos;re all set to begin.</h3>
              <p>Add your first task to turn this into a working plan.</p>
            </div>
          ) : (
            <ul className="task-list">
              {tasks.map((task) => (
                <li
                  className={`task-card ${task.is_complete ? "task-card-complete" : ""}`}
                  key={task.id}
                >
                  <input
                    aria-label={`Mark ${task.title} complete`}
                    checked={task.is_complete}
                    className="task-toggle"
                    onChange={() => handleTaskToggle(task.id)}
                    type="checkbox"
                  />
                  <div className="task-copy">
                    <p className="task-title">{task.title}</p>
                    <p className="task-detail">
                      {task.is_complete
                        ? "Completed and moved out of the way"
                        : "Open and ready for action"}
                    </p>
                  </div>
                  <span className="task-state">{task.is_complete ? "Done" : "Active"}</span>
                </li>
              ))}
            </ul>
          )}

          <p className="feedback dashboard-feedback">{message}</p>
        </section>
      )}
    </div>
  );
}

function createTask(title: string, isComplete = false): Task {
  return {
    id: crypto.randomUUID(),
    title,
    is_complete: isComplete,
    created_at: new Date().toISOString(),
  };
}

function sortTasks(taskList: Task[]) {
  return [...taskList].sort((left, right) => {
    if (left.is_complete !== right.is_complete) {
      return left.is_complete ? 1 : -1;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}
