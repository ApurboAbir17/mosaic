package settings

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func stringPtr(value string) *string { return &value }

func TestValidateTheme(t *testing.T) {
	for _, theme := range []string{"light", "dark", "system", " LIGHT "} {
		if _, err := validateTheme(theme); err != nil {
			t.Fatalf("validateTheme(%q) error = %v", theme, err)
		}
	}
	for _, theme := range []string{"", "sepia", "auto"} {
		if _, err := validateTheme(theme); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("validateTheme(%q) did not reject the value", theme)
		}
	}
}

func TestValidateVisibility(t *testing.T) {
	for _, visibility := range []string{"private", "public", " PUBLIC "} {
		if _, err := validateVisibility(visibility); err != nil {
			t.Fatalf("validateVisibility(%q) error = %v", visibility, err)
		}
	}
	for _, visibility := range []string{"", "friends", "hidden"} {
		if _, err := validateVisibility(visibility); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("validateVisibility(%q) did not reject the value", visibility)
		}
	}
}

func TestValidateActivityVisibility(t *testing.T) {
	for _, visibility := range []string{"private", "friends", "public"} {
		if _, err := validateActivityVisibility(visibility); err != nil {
			t.Fatalf("validateActivityVisibility(%q) error = %v", visibility, err)
		}
	}
	if _, err := validateActivityVisibility("everyone"); !errors.Is(err, ErrInvalidInput) {
		t.Fatal("validateActivityVisibility accepted an unknown value")
	}
}

func TestNormalizePatchRejectsWholePatchOnInvalidField(t *testing.T) {
	patch := Patch{Theme: stringPtr("dark"), CollectionVisibility: stringPtr("everyone")}
	if _, err := normalizePatch(patch); !errors.Is(err, ErrInvalidInput) {
		t.Fatal("normalizePatch accepted an invalid visibility")
	}
}

func TestNormalizePatchLeavesOmittedFieldsUnchanged(t *testing.T) {
	patch := Patch{Theme: stringPtr(" System ")}
	normalized, err := normalizePatch(patch)
	if err != nil {
		t.Fatalf("normalizePatch() error = %v", err)
	}
	if normalized.Theme == nil || *normalized.Theme != "system" {
		t.Fatalf("normalizePatch() theme = %v", normalized.Theme)
	}
	if normalized.CollectionVisibility != nil {
		t.Fatal("normalizePatch() changed an omitted field")
	}
	if normalized.Empty() {
		t.Fatal("normalizePatch() reported a supplied field as empty")
	}
}

func TestEmptyPatchDetectsNoChanges(t *testing.T) {
	if !(Patch{}).Empty() {
		t.Fatal("an empty patch must report no changes")
	}
	if (Patch{Theme: stringPtr("dark")}).Empty() {
		t.Fatal("a patch with a theme must not report no changes")
	}
}

func TestDecodePatchRejectsUnknownFields(t *testing.T) {
	request := httptest.NewRequest(http.MethodPatch, "/api/v1/settings/me",
		strings.NewReader(`{"theme":"dark","profile_vizibility":"public"}`))
	response := httptest.NewRecorder()

	if _, ok := decodePatch(response, request); ok {
		t.Fatal("decodePatch accepted an unknown field")
	}
	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected status %d, got %d", http.StatusBadRequest, response.Code)
	}
}

func TestDecodePatchAcceptsKnownFields(t *testing.T) {
	request := httptest.NewRequest(http.MethodPatch, "/api/v1/settings/me",
		strings.NewReader(`{"theme":"dark","profile_visibility":"public"}`))
	response := httptest.NewRecorder()

	patch, ok := decodePatch(response, request)
	if !ok {
		t.Fatal("decodePatch rejected a valid patch")
	}
	if patch.Theme == nil || *patch.Theme != "dark" {
		t.Fatalf("decodePatch() theme = %v", patch.Theme)
	}
	if patch.ProfileVisibility == nil || *patch.ProfileVisibility != "public" {
		t.Fatalf("decodePatch() profile visibility = %v", patch.ProfileVisibility)
	}
}

func TestDecodePatchRejectsNotificationPreferences(t *testing.T) {
	request := httptest.NewRequest(http.MethodPatch, "/api/v1/settings/me",
		strings.NewReader(`{"notification_preferences":{"system_updates":false}}`))
	response := httptest.NewRecorder()

	if _, ok := decodePatch(response, request); ok {
		t.Fatal("decodePatch accepted notification preferences before notifications exist")
	}
}
