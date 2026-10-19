const form = document.getElementById("login");
const error = document.getElementById("error");

async function submit(username, password) {
  error.hidden = true;
  const response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    error.textContent = payload.error || "Sign-in failed";
    error.hidden = false;
    return;
  }
  location.replace("/");
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  submit(form.username.value, form.password.value);
});

document.querySelectorAll("[data-user]").forEach((button) => {
  button.addEventListener("click", () => {
    form.username.value = button.dataset.user;
    form.password.value = button.dataset.pass;
    submit(button.dataset.user, button.dataset.pass);
  });
});
