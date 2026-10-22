const fallbackMovies = [
  { id: 1, title: "Breaking Bad", poster: "https://image.tmdb.org/t/p/w342/ggFHVNu6YYI5L9pCfOacjizRGt.jpg", year: "2008", rating: "9.5", description: "A high school chemistry teacher turned methamphetamine producer...", genres: [18, 80], type: "tv" },
  { id: 2, title: "The Office", poster: "https://image.tmdb.org/t/p/w342/qWnJzyZhyy74gjpSjIXWmuk0ifX.jpg", year: "2005", rating: "8.8", description: "A mockumentary on a group of typical office workers...", genres: [35], type: "tv" },
  { id: 3, title: "Stranger Things", poster: "https://image.tmdb.org/t/p/w342/x2LSRK2Cm7MZhjluni1msVJ3wDF.jpg", year: "2016", rating: "8.7", description: "When a young boy vanishes, a small town uncovers a mystery...", genres: [18, 9648, 10765], type: "tv" },
  { id: 4, title: "The Mandalorian", poster: "https://image.tmdb.org/t/p/w342/sWgBv7LV2PRoQgkxwlibdGXKz1S.jpg", year: "2019", rating: "8.7", description: "A lone gunfighter makes his way through the outer reaches...", genres: [10765, 12, 878], type: "tv" },
  { id: 5, title: "Spider-Man: Into the Spider-Verse", poster: "https://image.tmdb.org/t/p/w342/iiZZdoQBEYBv6id8kYg1ZHZs76V.jpg", year: "2018", rating: "8.4", description: "Teen Miles Morales becomes Spider-Man of his reality...", genres: [12, 16, 878], type: "movie" }
];

const state = { type: "both", user: null, authConfig: { googleOAuthEnabled: false, guestWatchPartyLimit: 3 }, currentQueueId: null, currentContentId: null, pollTimer: null, lobbyTimer: null, lobbyId: null, partner: null, kosmiRoomUrl: null, ratingShown: false, queueAttempt: 0, queuePending: false };
const $ = (selector) => document.querySelector(selector);
const apiBase = $('meta[name="kolli-api-base"]')?.content.trim().replace(/\/+$/, "") || "";
const elements = {
  grid: $("#movie-grid"),
  form: $("#search-form"),
  input: $("#search-input"),
  title: $("#results-title"),
  subtitle: $("#results-subtitle"),
  status: $("#results-status"),
  empty: $("#empty-state"),
  modal: $("#modal-backdrop"),
  modalContent: $("#modal-content"),
  toast: $("#toast")
};

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function imageFallback(image, title) {
  const fallback = document.createElement("div");
  fallback.className = "movie-poster-fallback";
  fallback.textContent = title;
  image.replaceWith(fallback);
}

function renderMovies(movies) {
  elements.grid.innerHTML = "";
  elements.empty.classList.toggle("hidden", movies.length > 0);
  elements.grid.classList.toggle("hidden", movies.length === 0);
  movies.forEach((movie, index) => {
    const card = document.createElement("article");
    card.className = "movie-card";
    card.dataset.index = String(index);
    const type = movie.type === "tv" || movie.type === "movie" ? movie.type : (state.type === "tv" ? "tv" : "movie");
    const year = movie.year || movie.releaseDate?.slice(0, 4) || "";
    card.innerHTML = `
      <div class="movie-poster">
        ${movie.poster ? `<img src="${escapeHTML(movie.poster)}" alt="${escapeHTML(movie.title)} poster" loading="lazy">` : `<div class="movie-poster-fallback">${escapeHTML(movie.title)}</div>`}
        ${movie.rating && movie.rating !== "N/A" ? `<span class="rating-pill">${escapeHTML(movie.rating)}</span>` : ""}
      </div>
      <div class="movie-info">
        <h3 class="movie-title" title="${escapeHTML(movie.title)}">${escapeHTML(movie.title)}</h3>
        <div class="movie-meta"><span>${escapeHTML(year)}</span><span>${type === "tv" ? "TV SERIES" : "MOVIE"}</span></div>
        <div class="movie-card-action">Find someone to watch <span aria-hidden="true">↗</span></div>
      </div>`;
    const image = card.querySelector("img");
    if (image) image.addEventListener("error", () => imageFallback(image, movie.title), { once: true });
    card.addEventListener("click", () => startMatching({ ...movie, type }));
    elements.grid.append(card);
  });
}

function setStatus(message, visible = true) {
  elements.status.textContent = message;
  elements.status.classList.toggle("hidden", !visible);
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("visible"), 3600);
}

async function request(url, options = {}) {
  if (window.location.protocol === "file:") {
    throw new Error("Kolli needs the Express server. Start it with npm start, then open http://localhost:3000 (not the HTML file directly).");
  }
  const response = await fetch(`${apiBase}${url}`, {
    credentials: "include",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function searchTitles(query) {
  if (query.trim().length < 2) {
    showToast("Type at least two characters to search.");
    return;
  }
  elements.title.innerHTML = `Results for <span>“${escapeHTML(query.trim())}”</span>`;
  elements.subtitle.textContent = "Choose a title and we’ll look for someone to watch with.";
  elements.grid.classList.add("hidden");
  elements.empty.classList.add("hidden");
  setStatus("Finding your next favorite…");
  $("#picks").scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const params = new URLSearchParams({ q: query.trim(), type: state.type });
    const data = await request(`/api/search?${params}`);
    const results = (data.results || []).map((result) => ({
      ...result,
      type: result.type === "movie" || result.type === "tv" ? result.type : state.type === "tv" ? "tv" : "movie"
    }));
    setStatus("", false);
    renderMovies(results);
    if (!results.length) elements.empty.classList.remove("hidden");
  } catch (error) {
    setStatus("", false);
    renderMovies([]);
    showToast(error.message);
  }
}

function openModal(content) {
  clearInterval(state.pollTimer);
  clearInterval(state.lobbyTimer);
  elements.modalContent.innerHTML = content;
  elements.modal.classList.remove("hidden");
  $("#modal-close").focus();
}

function closeModal() {
  elements.modal.classList.add("hidden");
  clearInterval(state.pollTimer);
  clearInterval(state.lobbyTimer);
  state.pollTimer = null;
  state.lobbyTimer = null;
  if (state.queuePending) {
    state.queueAttempt += 1;
    state.queuePending = false;
  }
  if (state.currentQueueId) leaveQueue(false);
}

function updateAccount(user) {
  state.user = user;
  $("#account-button").classList.toggle("hidden", Boolean(user));
  $("#profile-chip").classList.toggle("hidden", !user);
  if (!user) return;
  $("#profile-name").textContent = user.username || "Movie person";
  const avatar = $("#profile-avatar");
  avatar.classList.toggle("hidden", !user.avatar);
  if (user.avatar) avatar.src = user.avatar;
}

function promptGuest(movie = null) {
  openModal(`
    <div class="modal-eyebrow">NO ACCOUNT NEEDED</div>
    <h2 id="modal-title">What should we call you?</h2>
    <p class="modal-copy">Pick a display name and jump straight into finding someone to watch with.</p>
    <form class="guest-form" id="guest-form">
      <label class="visually-hidden" for="guest-name">Display name</label>
      <input id="guest-name" name="username" minlength="3" maxlength="24" required autocomplete="nickname" placeholder="Your display name">
      <label class="guest-consent"><input id="adult-confirmation" type="checkbox" required><span>I confirm I am 18 or older.</span></label>
      <label class="guest-consent"><input id="privacy-acceptance" type="checkbox" required><span>I have read and accept the <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Notice</a> and understand my name, selected title, and messages are shared with my match.</span></label>
      <button class="button button-dark" type="submit">Continue as guest <span aria-hidden="true">↗</span></button>
    </form>`);
  $("#guest-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#guest-form button");
    button.disabled = true;
    try {
      const result = await request("/auth/guest", {
        method: "POST",
        body: JSON.stringify({
          username: $("#guest-name").value.trim(),
          adultConfirmed: $("#adult-confirmation").checked,
          privacyNoticeAccepted: $("#privacy-acceptance").checked
        })
      });
      updateAccount(result.user);
      if (movie) {
        startMatching(movie);
      } else {
        closeModal();
        showToast(`You’re in, ${result.user.username}. Pick a title to find your match.`);
      }
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  });
}

async function startMatching(movie) {
  if (!state.user) {
    promptGuest(movie);
    return;
  }
  state.currentContentId = movie.id;
  const type = movie.type === "tv" ? "tv" : "movie";
  const attempt = ++state.queueAttempt;
  state.queuePending = true;
  openModal(`
    <div class="modal-eyebrow">YOUR NEXT SHARED MOMENT</div>
    <h2 id="modal-title">Let’s find your person.</h2>
    <div class="queue-movie">${movie.poster ? `<img src="${escapeHTML(movie.poster)}" alt="">` : ""}<span><strong>${escapeHTML(movie.title)}</strong><small>${escapeHTML(movie.year || "Tonight's pick")} · ${type === "tv" ? "TV show" : "Movie"}</small></span></div>
    <div class="queue-loader" aria-hidden="true"></div>
    <p class="modal-copy" id="queue-message">Looking for someone who wants to watch this too…</p>
    <button class="button button-dark" id="cancel-queue">Cancel search</button>`);
  $("#cancel-queue").addEventListener("click", closeModal);
  try {
    const data = await request("/api/queue/join", {
      method: "POST",
      body: JSON.stringify({
        contentId: movie.id,
        contentTitle: movie.title,
        contentType: type,
        posterUrl: movie.poster || "",
        releaseYear: Number(movie.year) || null,
        genre: movie.genres?.length ? movie.genres[0] : "",
        genreId: movie.genres?.length ? movie.genres[0] : ""
      })
    });
    state.queuePending = false;
    if (attempt !== state.queueAttempt || elements.modal.classList.contains("hidden")) {
      await request("/api/queue/leave", { method: "POST", body: JSON.stringify({ queueId: data.queueId }) });
      return;
    }
    state.currentQueueId = data.queueId || null;
    if (data.status === "matched") {
      await showLobby(data.matchId);
      return;
    }
    $("#queue-message").textContent = "You’re in the queue. We’ll let you know the moment someone’s ready.";
    state.pollTimer = window.setInterval(checkQueue, 3000);
    checkQueue();
  } catch (error) {
    if (attempt === state.queueAttempt) state.queuePending = false;
    if (attempt === state.queueAttempt && error.code === "account_link_required") {
      promptAccountLink(error.message);
    } else {
      showToast(error.message);
      if (attempt === state.queueAttempt) closeModal();
    }
  }
}

async function checkQueue() {
  try {
    const query = state.currentContentId ? `?contentId=${encodeURIComponent(state.currentContentId)}` : "";
    const result = await request(`/api/queue/status${query}`);
    if ((result.status === "matched" || result.status === "ended") && result.matchId) {
      clearInterval(state.pollTimer);
      state.currentQueueId = null;
      await showLobby(result.matchId);
    } else if (result.status === "none") {
      clearInterval(state.pollTimer);
      state.currentQueueId = null;
      $("#queue-message").textContent = "Your search ended. Pick a title to try again.";
      $(".queue-loader")?.classList.add("hidden");
    }
  } catch (error) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
    $("#queue-message").textContent = `We couldn’t check the queue: ${error.message}`;
    $(".queue-loader")?.classList.add("hidden");
  }
}

async function leaveQueue(notify = true) {
  if (!state.currentQueueId) return;
  try {
    await request("/api/queue/leave", {
      method: "POST",
      body: JSON.stringify({ queueId: state.currentQueueId })
    });
  } catch (error) {
    if (notify) showToast(error.message);
  } finally {
    state.currentQueueId = null;
  }
}

async function showLobby(matchId) {
  state.lobbyId = matchId;
  state.ratingShown = false;
  clearInterval(state.pollTimer);
  state.currentQueueId = null;
  let lobby;
  try {
    lobby = await request(`/api/lobby/${encodeURIComponent(matchId)}`);
  } catch (error) {
    showToast(error.message);
    return;
  }
  const partner = lobby.user1 && lobby.user2
    ? (String(lobby.user1._id) === String(state.user?.id) ? lobby.user2 : lobby.user1)
    : null;
  if (!partner) {
    showToast("We couldn’t identify your match. Please reload and try again.");
    return;
  }
  state.partner = { id: partner._id, username: partner.username || "Your watch buddy" };
  state.kosmiRoomUrl = lobby.kosmiRoomUrl || null;
  if (lobby.status === "ended") {
    showRating();
    return;
  }
  const partnerName = state.partner.username;
  openModal(`
    <div class="modal-eyebrow">YOU FOUND YOUR PEOPLE ✳</div>
    <h2 id="modal-title">Matched. Let’s watch.</h2>
    <p class="modal-copy">You and ${escapeHTML(partnerName)} picked <strong>${escapeHTML(lobby.contentTitle || "the same thing")}</strong>. Share a Kosmi room link, then watch together.</p>
    <section class="kosmi-section">
      <h3>Your Kosmi room</h3>
      <p>Open Kosmi to create a room, then paste its invite link here. It’ll be shared with your match. If Kosmi blocks embedding, open the room in a new tab.</p>
      <a class="kosmi-open-link" href="https://kosmi.io" target="_blank" rel="noopener noreferrer">Open Kosmi in a new tab ↗</a>
      <form class="kosmi-form" id="kosmi-form">
        <label class="visually-hidden" for="kosmi-url">Kosmi room URL</label>
        <input id="kosmi-url" type="url" placeholder="https://kosmi.io/…" maxlength="2048" autocomplete="url">
        <button class="button button-red" type="submit">Share room</button>
      </form>
      <div class="kosmi-player" id="kosmi-player"><div class="kosmi-player-empty">Waiting for a Kosmi room link from you or your match.</div></div>
      <a class="kosmi-open-link hidden" id="kosmi-room-link" target="_blank" rel="noopener noreferrer">Open room in a new tab ↗</a>
    </section>
    <div class="chat-box">
      <div class="chat-messages" id="chat-messages"><div class="chat-message"><strong>Kolli</strong>You matched! Say hi and make a plan.</div></div>
      <form class="chat-form" id="chat-form">
        <label class="visually-hidden" for="chat-input">Write a message</label>
        <input id="chat-input" maxlength="1000" placeholder="Write a message…" autocomplete="off">
        <button class="button button-red" type="submit" aria-label="Send message">Send</button>
      </form>
    </div>
    <button class="text-button" id="leave-lobby" type="button" style="margin-top:14px">Finish watch &amp; rate ${escapeHTML(partnerName)}</button>`);
  $("#chat-form").addEventListener("submit", sendChatMessage);
  $("#leave-lobby").addEventListener("click", endLobby);
  $("#kosmi-form").addEventListener("submit", saveKosmiRoom);
  if (state.kosmiRoomUrl) renderKosmiRoom(state.kosmiRoomUrl);
  await loadMessages();
  state.lobbyTimer = window.setInterval(() => {
    loadMessages();
    refreshLobby();
  }, 2500);
}

function renderKosmiRoom(roomUrl) {
  const player = $("#kosmi-player");
  const roomLink = $("#kosmi-room-link");
  if (!player || !roomLink || !roomUrl) return;
  const parsedUrl = new URL(roomUrl);
  if (parsedUrl.protocol !== "https:" ||
      (parsedUrl.hostname !== "kosmi.io" && !parsedUrl.hostname.endsWith(".kosmi.io"))) {
    showToast("This Kosmi room link isn’t valid.");
    return;
  }
  state.kosmiRoomUrl = parsedUrl.toString();
  $("#kosmi-url").value = state.kosmiRoomUrl;
  player.innerHTML = "";
  const frame = document.createElement("iframe");
  frame.src = state.kosmiRoomUrl;
  frame.title = "Kosmi watch room";
  frame.allow = "autoplay; camera; microphone; fullscreen; display-capture";
  frame.referrerPolicy = "no-referrer";
  player.append(frame);
  roomLink.href = state.kosmiRoomUrl;
  roomLink.classList.remove("hidden");
}

async function saveKosmiRoom(event) {
  event.preventDefault();
  const roomUrl = $("#kosmi-url").value.trim();
  try {
    const result = await request(`/api/lobby/${encodeURIComponent(state.lobbyId)}/kosmi-room`, {
      method: "PUT",
      body: JSON.stringify({ roomUrl })
    });
    if (result.kosmiRoomUrl) {
      renderKosmiRoom(result.kosmiRoomUrl);
      showToast("Kosmi room shared with your match.");
    } else {
      state.kosmiRoomUrl = null;
      $("#kosmi-player").innerHTML = '<div class="kosmi-player-empty">Waiting for a Kosmi room link from you or your match.</div>';
      $("#kosmi-room-link").classList.add("hidden");
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function refreshLobby() {
  if (!state.lobbyId || state.ratingShown) return;
  try {
    const lobby = await request(`/api/lobby/${encodeURIComponent(state.lobbyId)}`);
    if (lobby.kosmiRoomUrl && lobby.kosmiRoomUrl !== state.kosmiRoomUrl) {
      renderKosmiRoom(lobby.kosmiRoomUrl);
    }
    if (lobby.status === "ended") showRating();
  } catch (error) {
    clearInterval(state.lobbyTimer);
    showToast(error.message);
  }
}

function showRating() {
  if (state.ratingShown) return;
  state.ratingShown = true;
  clearInterval(state.lobbyTimer);
  if (!state.partner?.id) {
    showToast("The watch party ended, but we couldn’t load your match for rating.");
    closeModal();
    return;
  }
  openModal(`
    <div class="modal-eyebrow">THE CREDITS ROLLED ✳</div>
    <h2 id="modal-title">How was watching with ${escapeHTML(state.partner.username)}?</h2>
    <p class="modal-copy">A quick rating helps make Kolli a better place to find your people.</p>
    <form class="rating-form" id="rating-form">
      <fieldset>
        <legend>Your experience</legend>
        <div class="rating-stars">
          ${[1, 2, 3, 4, 5].map((stars) => `<label><input type="radio" name="stars" value="${stars}"${stars === 5 ? " checked" : ""}><span aria-label="${stars} star${stars === 1 ? "" : "s"}">★</span></label>`).join("")}
        </div>
      </fieldset>
      <label class="visually-hidden" for="rating-comment">Optional note</label>
      <textarea id="rating-comment" maxlength="500" placeholder="Anything you’d like to share? (optional)"></textarea>
      <button class="button button-red" type="submit">Send rating</button>
      <button class="text-button" type="button" id="skip-rating">Not now</button>
    </form>`);
  $("#rating-form").addEventListener("submit", submitRating);
  $("#skip-rating").addEventListener("click", async () => {
    await loadProfile();
    if (shouldLinkAccount()) promptAccountLink();
    else closeModal();
  });
}

function shouldLinkAccount() {
  return Boolean(state.user?.isGuest &&
    Number(state.user.completedWatchParties) >= state.authConfig.guestWatchPartyLimit);
}

function promptAccountLink(message = "") {
  const required = shouldLinkAccount();
  const configured = state.authConfig.googleOAuthEnabled;
  openModal(`
    <div class="modal-eyebrow">${required ? "KEEP YOUR WATCH HISTORY" : "ACCOUNT & PRIVACY"}</div>
    <h2 id="modal-title">${required ? "Keep the good times going." : "Link your Kolli account."}</h2>
    <p class="modal-copy">${escapeHTML(message || (required
      ? `You’ve completed ${state.authConfig.guestWatchPartyLimit} watch parties. Link Google to save your account and keep matching.`
      : "Link a Google account to keep your profile and watch history if you change devices."))}</p>
    ${configured
      ? `<button class="button button-dark" id="link-google-button">Link Google account <span aria-hidden="true">↗</span></button>`
      : `<p class="account-warning">Google account linking isn’t configured on this Kolli server yet. The operator must set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.</p>`}
    ${required
      ? '<button class="text-button" id="link-later-button" type="button">Maybe later</button>'
      : '<a class="text-button" href="/privacy.html">Read the privacy notice ↗</a>'}`);
  if (configured) {
    $("#link-google-button").addEventListener("click", () => {
      window.location.href = "/auth/google/link";
    });
  }
  $("#link-later-button")?.addEventListener("click", closeModal);
}

async function submitRating(event) {
  event.preventDefault();
  const button = $("#rating-form button[type='submit']");
  button.disabled = true;
  const formData = new FormData(event.currentTarget);
  try {
    await request("/api/user/rate", {
      method: "POST",
      body: JSON.stringify({
        partnerId: state.partner.id,
        stars: Number(formData.get("stars")),
        comment: $("#rating-comment").value.trim()
      })
    });
    await loadProfile();
    if (shouldLinkAccount()) {
      state.lobbyId = null;
      promptAccountLink();
    } else {
      openModal(`
        <div class="modal-eyebrow">THANKS FOR THE GOOD VIBES</div>
        <h2 id="modal-title">Rating sent.</h2>
        <p class="modal-copy">Thanks for making time for a shared movie night.</p>
        <button class="button button-dark" id="rating-done">Back to Kolli</button>`);
      $("#rating-done").addEventListener("click", () => {
        state.lobbyId = null;
        closeModal();
      });
    }
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
}

function appendMessage(message) {
  const list = $("#chat-messages");
  if (!list || list.querySelector(`[data-message-id="${CSS.escape(String(message.id))}"]`)) return;
  const ownMessage = message.senderName === state.user?.username;
  const bubble = document.createElement("div");
  bubble.className = `chat-message${ownMessage ? " mine" : ""}`;
  bubble.dataset.messageId = String(message.id);
  const sender = document.createElement("strong");
  sender.textContent = ownMessage ? "You" : message.senderName || "Your match";
  bubble.append(sender, document.createTextNode(message.text || ""));
  list.append(bubble);
  list.scrollTop = list.scrollHeight;
}

async function loadMessages() {
  if (!state.lobbyId) return;
  try {
    const data = await request(`/api/lobby/${encodeURIComponent(state.lobbyId)}/messages`);
    (data.messages || []).forEach(appendMessage);
  } catch (error) {
    clearInterval(state.lobbyTimer);
    showToast(error.message);
  }
}

async function sendChatMessage(event) {
  event.preventDefault();
  const input = $("#chat-input");
  const text = input.value.trim();
  if (!text) return;
  try {
    const data = await request(`/api/lobby/${encodeURIComponent(state.lobbyId)}/message`, {
      method: "POST",
      body: JSON.stringify({ text })
    });
    input.value = "";
    if (data.message) appendMessage({ ...data.message, senderName: state.user?.username });
  } catch (error) {
    showToast(error.message);
  }
}

async function endLobby() {
  try {
    await request(`/api/lobby/${encodeURIComponent(state.lobbyId)}/leave`, { method: "POST", body: JSON.stringify({}) });
    showRating();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadProfile() {
  try {
    const user = await request("/api/user/profile");
    updateAccount(user);
  } catch (error) {
    if (error.status !== 401 && error.status !== 403) showToast(error.message);
  }
}

function showAccountMenu() {
  const completed = Number(state.user?.completedWatchParties || 0);
  openModal(`
    <div class="modal-eyebrow">YOUR KOLLI ACCOUNT</div>
    <h2 id="modal-title">Hey, ${escapeHTML(state.user?.username || "movie person")}.</h2>
    <p class="modal-copy">${state.user?.isGuest
      ? `${completed} of ${state.authConfig.guestWatchPartyLimit} guest watch parties completed.`
      : "Your Kolli account is linked and your watch history is saved."}</p>
    <div class="account-actions">
      ${state.user?.isGuest && state.authConfig.googleOAuthEnabled
        ? '<button class="button button-dark" id="account-link-google">Link Google account <span aria-hidden="true">↗</span></button>'
        : ""}
      <button class="button button-dark" id="export-data-button">Download my data <span aria-hidden="true">↓</span></button>
      <button class="text-button" id="delete-account-button" type="button">Delete my account and data</button>
      <a class="text-button" href="/privacy.html">Privacy notice ↗</a>
      <button class="text-button" id="account-sign-out" type="button">Sign out</button>
    </div>`);
  $("#account-link-google")?.addEventListener("click", () => {
    window.location.href = "/auth/google/link";
  });
  $("#export-data-button").addEventListener("click", exportData);
  $("#delete-account-button").addEventListener("click", confirmDeleteAccount);
  $("#account-sign-out").addEventListener("click", signOut);
}

async function exportData() {
  try {
    const data = await request("/api/user/privacy/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "kolli-personal-data.json";
    link.click();
    URL.revokeObjectURL(downloadUrl);
    showToast("Your data export has been downloaded.");
  } catch (error) {
    showToast(error.message);
  }
}

function confirmDeleteAccount() {
  openModal(`
    <div class="modal-eyebrow">ACCOUNT DELETION</div>
    <h2 id="modal-title">Delete your Kolli data?</h2>
    <p class="modal-copy">This permanently deletes your Kolli profile, watch parties, messages, ratings, reports, and queue entries. This cannot be undone.</p>
    <div class="account-actions">
      <button class="button button-red" id="confirm-delete-account">Permanently delete my account</button>
      <button class="text-button" id="cancel-delete-account" type="button">Cancel</button>
    </div>`);
  $("#confirm-delete-account").addEventListener("click", deleteAccount);
  $("#cancel-delete-account").addEventListener("click", showAccountMenu);
}

async function deleteAccount() {
  const button = $("#confirm-delete-account");
  button.disabled = true;
  try {
    await request("/api/user/account", { method: "DELETE" });
    state.user = null;
    state.lobbyId = null;
    updateAccount(null);
    openModal(`
      <div class="modal-eyebrow">ACCOUNT DELETED</div>
      <h2 id="modal-title">You’re all set.</h2>
      <p class="modal-copy">Your Kolli account and associated data have been deleted.</p>
      <button class="button button-dark" id="after-delete">Back to Kolli</button>`);
    $("#after-delete").addEventListener("click", closeModal);
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
}

async function signOut() {
  try {
    await request("/auth/logout", { method: "POST", body: JSON.stringify({}) });
    window.location.reload();
  } catch (error) {
    showToast(error.message);
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  searchTitles(elements.input.value);
});

document.querySelectorAll(".type-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".type-button.selected")?.classList.remove("selected");
    button.classList.add("selected");
    state.type = button.dataset.type;
  });
});

$("#account-button").addEventListener("click", () => promptGuest());
$("#how-cta").addEventListener("click", () => {
  if (state.user) $("#search-input").focus();
  else promptGuest();
});
$("#show-all-button").addEventListener("click", () => {
  const cards = [...elements.grid.querySelectorAll(".movie-card")];
  const expanded = elements.grid.classList.toggle("show-all");
  cards.forEach((card) => card.classList.toggle("expanded", expanded));
  $("#show-all-button").innerHTML = expanded ? 'Show less <span aria-hidden="true">↗</span>' : 'Explore all <span aria-hidden="true">↗</span>';
});
$("#account-menu-button").addEventListener("click", showAccountMenu);
$("#modal-close").addEventListener("click", closeModal);
elements.modal.addEventListener("click", (event) => {
  if (event.target === elements.modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.modal.classList.contains("hidden")) closeModal();
});
window.addEventListener("beforeunload", () => {
  clearInterval(state.pollTimer);
  clearInterval(state.lobbyTimer);
});

renderMovies(fallbackMovies);
request("/auth/config").then((config) => {
  state.authConfig = { ...state.authConfig, ...config };
}).catch((error) => {
  showToast(`Could not load sign-in configuration: ${error.message}`);
});
loadProfile();

const params = new URLSearchParams(window.location.search);
if (params.has("auth_error")) showToast("Sign-in didn’t work. Please try again.");
if (params.has("account_link_error")) {
  const error = params.get("account_link_error");
  const messages = {
    google_not_configured: "Google linking is not configured on this server.",
    google_email_required: "Google did not return an email address for linking.",
    google_already_linked: "That Google account is already linked to another Kolli account.",
    email_already_used: "That email address belongs to another Kolli account.",
    guest_session_required: "Please sign in to your guest session and try linking again.",
    guest_not_found: "Your guest account could not be found."
  };
  showToast(messages[error] || "Could not link your account. Please try again.");
}
