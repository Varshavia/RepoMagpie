// A placeholder for the local app until feat/ui-app: it proves the session flow (cookie for reads,
// X-Magpie-Token for writes) and lists notes through the API. Text is set with textContent only.
const token = document.querySelector('meta[name="magpie-token"]').content;

async function api(path, init) {
  const response = await fetch(path, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  return body;
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

async function showSettings() {
  const settings = await api("/api/settings");
  const list = document.getElementById("settings");
  const project = settings.journals.project;
  list.replaceChildren(
    element("dt", "Personal"), element("dd", settings.journals.personal.path),
    element("dt", "Project"), element("dd", project ? project.path : "None: not in a project."),
    element("dt", "GitHub token"), element("dd", settings.github_token_set ? "Set" : "Not set"),
    element("dt", "Version"), element("dd", settings.version),
  );
}

async function showNotes(journal) {
  const status = document.getElementById(`${journal}-status`);
  const list = document.getElementById(`${journal}-notes`);
  try {
    const { count, notes } = await api(`/api/notes?journal=${journal}`);
    status.textContent = count ? `${count} ${count === 1 ? "note" : "notes"}.` : "No notes yet. Add one with magpie note.";
    list.replaceChildren(...notes.map((note) => {
      const item = element("li", "");
      item.append(element("span", note.name ?? note.file, "name"));
      if (note.read_only) item.append(element("span", "read-only", "label"));
      else if (note.status === "inbox") item.append(element("span", "[inbox] no verdict yet", "label"));
      else item.append(element("span", note.verdict, "verdict"));
      return item;
    }));
  } catch (error) {
    status.textContent = `Couldn't load the notes: ${error.message}`;
  }
}

document.getElementById("preview").addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = document.getElementById("preview-result");
  const target = document.getElementById("target").value;
  try {
    const preview = await api("/api/note/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Magpie-Token": token },
      body: JSON.stringify({ target, to: "personal" }),
    });
    result.textContent = JSON.stringify(preview, null, 2);
  } catch (error) {
    result.textContent = error.message;
  }
});

// Live updates: a note changed on disk reloads that journal's list.
new EventSource("/api/events").addEventListener("notes-changed", (event) => {
  showNotes(JSON.parse(event.data).journal);
});

showSettings().catch((error) => {
  document.getElementById("settings").replaceChildren(element("dt", "Error"), element("dd", error.message));
});
showNotes("personal");
showNotes("project");
