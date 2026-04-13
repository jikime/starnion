package notification

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/newstarnion/gateway/internal/domain/entity"
)

type fakeNotificationRepo struct {
	listRows     []entity.Notification
	listErr      error
	lastLimit    int
	lastUnreadOnly bool

	unreadCount int
	unreadErr   error

	markReadCalled    bool
	markReadID        int64
	markAllReadCalled bool
}

func (f *fakeNotificationRepo) List(ctx context.Context, userID uuid.UUID, limit int, unreadOnly bool) ([]entity.Notification, error) {
	f.lastLimit = limit
	f.lastUnreadOnly = unreadOnly
	return f.listRows, f.listErr
}

func (f *fakeNotificationRepo) CountUnread(ctx context.Context, userID uuid.UUID) (int, error) {
	return f.unreadCount, f.unreadErr
}

func (f *fakeNotificationRepo) MarkRead(ctx context.Context, userID uuid.UUID, id int64) error {
	f.markReadCalled = true
	f.markReadID = id
	return nil
}

func (f *fakeNotificationRepo) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	f.markAllReadCalled = true
	return nil
}

func TestList_ClampsLimit(t *testing.T) {
	cases := []struct {
		name      string
		limitArg  int
		wantLimit int
	}{
		{"zero coerces to default", 0, defaultListLimit},
		{"negative coerces to default", -5, defaultListLimit},
		{"oversize coerces to default", maxListLimit + 50, defaultListLimit},
		{"valid preserved", 50, 50},
		{"boundary max preserved", maxListLimit, maxListLimit},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &fakeNotificationRepo{}
			uc := NewUseCase(repo)
			_, err := uc.List(context.Background(), uuid.New(), tc.limitArg, false)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if repo.lastLimit != tc.wantLimit {
				t.Errorf("limit: got %d, want %d", repo.lastLimit, tc.wantLimit)
			}
		})
	}
}

func TestList_ForwardsUnreadOnly(t *testing.T) {
	repo := &fakeNotificationRepo{}
	uc := NewUseCase(repo)
	_, err := uc.List(context.Background(), uuid.New(), 10, true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.lastUnreadOnly {
		t.Errorf("unreadOnly flag must forward to the repo")
	}
}

func TestList_PropagatesListError(t *testing.T) {
	sentinel := errors.New("list failed")
	repo := &fakeNotificationRepo{listErr: sentinel}
	uc := NewUseCase(repo)
	_, err := uc.List(context.Background(), uuid.New(), 10, false)
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel, got %v", err)
	}
}

func TestList_PropagatesCountError(t *testing.T) {
	sentinel := errors.New("count failed")
	repo := &fakeNotificationRepo{unreadErr: sentinel}
	uc := NewUseCase(repo)
	_, err := uc.List(context.Background(), uuid.New(), 10, false)
	if !errors.Is(err, sentinel) {
		t.Fatalf("expected sentinel, got %v", err)
	}
}

func TestList_ReturnsUnreadCountFromRepo(t *testing.T) {
	repo := &fakeNotificationRepo{
		listRows:    []entity.Notification{{ID: 1}},
		unreadCount: 7,
	}
	uc := NewUseCase(repo)
	res, err := uc.List(context.Background(), uuid.New(), 10, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.UnreadCount != 7 {
		t.Errorf("UnreadCount: got %d, want 7", res.UnreadCount)
	}
	if len(res.Notifications) != 1 {
		t.Errorf("expected 1 notification, got %d", len(res.Notifications))
	}
}

func TestMarkRead_ForwardsID(t *testing.T) {
	repo := &fakeNotificationRepo{}
	uc := NewUseCase(repo)
	if err := uc.MarkRead(context.Background(), uuid.New(), 42); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.markReadCalled || repo.markReadID != 42 {
		t.Errorf("expected MarkRead(42), got called=%v id=%d", repo.markReadCalled, repo.markReadID)
	}
}

func TestMarkAllRead_CallsRepo(t *testing.T) {
	repo := &fakeNotificationRepo{}
	uc := NewUseCase(repo)
	if err := uc.MarkAllRead(context.Background(), uuid.New()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.markAllReadCalled {
		t.Errorf("expected MarkAllRead to be called")
	}
}
