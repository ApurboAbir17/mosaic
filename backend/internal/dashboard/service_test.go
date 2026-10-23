package dashboard

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestEmptySectionsSerializeAsArrays(t *testing.T) {
	payload, err := json.Marshal(newSections())
	if err != nil {
		t.Fatalf("marshal sections: %v", err)
	}
	body := string(payload)
	for _, key := range []string{
		"continue_watching",
		"watch_next",
		"recently_added",
		"favorites",
		"recently_rated",
		"completed",
		"recent_reviews",
	} {
		if !strings.Contains(body, `"`+key+`":[]`) {
			t.Fatalf("section %q did not serialize as an empty array: %s", key, body)
		}
	}
}

func TestPreviewLimitIsBounded(t *testing.T) {
	if PreviewLimit < 1 || PreviewLimit > 5 {
		t.Fatalf("PreviewLimit must stay between 1 and 5, got %d", PreviewLimit)
	}
}
