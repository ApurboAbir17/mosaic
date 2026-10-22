package settings

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/MdRasB/mosaic/backend/internal/auth"
	"github.com/MdRasB/mosaic/backend/internal/config"
	"github.com/MdRasB/mosaic/backend/internal/profile"
)

type Handler struct {
	service *Service
	auth    *auth.Service
	config  config.Config
}

func NewHandler(service *Service, authService *auth.Service, cfg config.Config) *Handler {
	return &Handler{service: service, auth: authService, config: cfg}
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if r.Method != http.MethodGet && r.Method != http.MethodPatch {
		w.Header().Set("Allow", "GET, PATCH, OPTIONS")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	user, ok := h.user(w, r)
	if !ok {
		return
	}
	if r.Method == http.MethodGet {
		h.get(w, r, user.ID)
		return
	}
	h.update(w, r, user.ID)
}

func (h *Handler) get(w http.ResponseWriter, r *http.Request, userID string) {
	result, err := h.service.Get(r.Context(), userID)
	if err != nil {
		h.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) update(w http.ResponseWriter, r *http.Request, userID string) {
	patch, ok := decodePatch(w, r)
	if !ok {
		return
	}
	result, err := h.service.Update(r.Context(), userID, patch)
	if err != nil {
		h.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) user(w http.ResponseWriter, r *http.Request) (auth.User, bool) {
	user, err := h.auth.CurrentUser(r.Context(), h.sessionToken(r))
	if errors.Is(err, auth.ErrSessionNotFound) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{
			"code": "unauthorized", "message": "Authentication required.",
		})
		return auth.User{}, false
	}
	if err != nil {
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
		return auth.User{}, false
	}
	return user, true
}

func (h *Handler) serviceError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, ErrInvalidInput):
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"code": "invalid_input", "message": err.Error(),
		})
	case errors.Is(err, ErrNotFound), errors.Is(err, profile.ErrNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{
			"code": "not_found", "message": "Settings are not available.",
		})
	default:
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
	}
}

func (h *Handler) sessionToken(r *http.Request) string {
	cookie, err := r.Cookie(h.config.SessionCookie)
	if err != nil {
		return ""
	}
	return cookie.Value
}

// decodePatch reads a partial update. Unknown fields are rejected so a typo
// never silently does nothing.
func decodePatch(w http.ResponseWriter, r *http.Request) (Patch, bool) {
	r.Body = http.MaxBytesReader(w, r.Body, 8<<10)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var patch Patch
	if err := decoder.Decode(&patch); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"code": "invalid_json", "message": "Request body is invalid.",
		})
		return Patch{}, false
	}
	return patch, true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
