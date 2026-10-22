package dashboard

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/MdRasB/mosaic/backend/internal/auth"
	"github.com/MdRasB/mosaic/backend/internal/config"
)

type Handler struct {
	service *Service
	auth    *auth.Service
	config  config.Config
}

func NewHandler(service *Service, authService *auth.Service, cfg config.Config) *Handler {
	return &Handler{service: service, auth: authService, config: cfg}
}

func (h *Handler) Dashboard(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "private, no-store")
	if r.Method != http.MethodGet {
		methodError(w, "GET, OPTIONS")
		return
	}
	user, ok := h.user(w, r)
	if !ok {
		return
	}
	response, err := h.service.Get(r.Context(), user.ID)
	if err != nil {
		h.serviceError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, response)
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
	if errors.Is(err, ErrProfileNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{
			"code": "profile_not_found", "message": "Dashboard profile is unavailable.",
		})
		return
	}
	http.Error(w, "service unavailable", http.StatusServiceUnavailable)
}

func (h *Handler) sessionToken(r *http.Request) string {
	cookie, err := r.Cookie(h.config.SessionCookie)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func methodError(w http.ResponseWriter, methods string) {
	w.Header().Set("Allow", methods)
	http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
}
