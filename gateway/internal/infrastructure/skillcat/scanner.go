// Package skillcat reads agent/skills/<id>/SKILL.md files and parses
// their YAML frontmatter into entity.SkillMeta. Extracted from
// handler/skills_handler.go so the skills CA slice can depend on a
// small port instead of direct filesystem I/O inside the usecase.
package skillcat

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/newstarnion/gateway/internal/domain/entity"
	"go.yaml.in/yaml/v3"
)

// Scanner reads SKILL.md files from a base directory.
type Scanner struct {
	dir string
}

// NewScanner constructs a Scanner rooted at the given directory.
// Typically passed `cfg.SkillsDir` in the bootstrap.
func NewScanner(dir string) *Scanner {
	return &Scanner{dir: dir}
}

// yamlFrontmatter is the parse target for the YAML block at the top
// of every SKILL.md file.
type yamlFrontmatter struct {
	DisplayName      string `yaml:"display_name"`
	Description      string `yaml:"description"`
	Emoji            string `yaml:"emoji"`
	Category         string `yaml:"category"`
	EnabledByDefault bool   `yaml:"enabled_by_default"`
	RequiresAPIKey   bool   `yaml:"requires_api_key"`
	APIKeyProvider   string `yaml:"api_key_provider"`
	APIKeyType       string `yaml:"api_key_type"`
	APIKeyLabel      string `yaml:"api_key_label"`
	APIKeyLabel1     string `yaml:"api_key_label_1"`
	APIKeyLabel2     string `yaml:"api_key_label_2"`
	UsesProvider     bool   `yaml:"uses_provider"`
}

// ListAll scans `dir/*/SKILL.md` and returns every successfully
// parsed skill. Skills that fail to parse or have an empty
// display_name are silently dropped — matches legacy behaviour so
// broken skill directories never take down the catalogue endpoint.
func (s *Scanner) ListAll() []entity.SkillMeta {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil
	}
	var out []entity.SkillMeta
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		path := filepath.Join(s.dir, e.Name(), "SKILL.md")
		meta, err := parseSkillMD(path)
		if err != nil || meta.DisplayName == "" {
			continue
		}
		out = append(out, meta)
	}
	return out
}

// Get reads a single SKILL.md by skill id. Returns a non-nil error
// when the file does not exist or the frontmatter is missing.
func (s *Scanner) Get(id string) (entity.SkillMeta, error) {
	path := filepath.Join(s.dir, id, "SKILL.md")
	meta, err := parseSkillMD(path)
	if err != nil {
		return entity.SkillMeta{}, err
	}
	if meta.DisplayName == "" {
		return entity.SkillMeta{}, fmt.Errorf("skill %s: missing display_name", id)
	}
	return meta, nil
}

func parseSkillMD(path string) (entity.SkillMeta, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return entity.SkillMeta{}, err
	}
	s := string(data)
	if !strings.HasPrefix(s, "---") {
		return entity.SkillMeta{ID: filepath.Base(filepath.Dir(path))}, nil
	}
	s = s[3:]
	end := strings.Index(s, "\n---")
	if end < 0 {
		return entity.SkillMeta{ID: filepath.Base(filepath.Dir(path))}, nil
	}
	var fm yamlFrontmatter
	if err := yaml.Unmarshal([]byte(s[:end]), &fm); err != nil {
		return entity.SkillMeta{}, err
	}
	return entity.SkillMeta{
		ID:               filepath.Base(filepath.Dir(path)),
		DisplayName:      fm.DisplayName,
		Description:      fm.Description,
		Emoji:            fm.Emoji,
		Category:         fm.Category,
		EnabledByDefault: fm.EnabledByDefault,
		RequiresAPIKey:   fm.RequiresAPIKey,
		APIKeyProvider:   fm.APIKeyProvider,
		APIKeyType:       fm.APIKeyType,
		APIKeyLabel:      fm.APIKeyLabel,
		APIKeyLabel1:     fm.APIKeyLabel1,
		APIKeyLabel2:     fm.APIKeyLabel2,
		UsesProvider:     fm.UsesProvider,
	}, nil
}
