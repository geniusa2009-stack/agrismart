import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, MapPin, Pencil, UserPlus, UserMinus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, Badge, Spinner, ErrorState } from '../../components/ui';
import { t, formatDate } from '../../i18n';

/**
 * ملفي الشخصي / farmer profile — real API-backed only. Two entry
 * points share this one component:
 *   /community/profile           -> viewer's own profile (GET .../profile/me)
 *   /community/profile/:userId   -> any farmer's public profile
 *       (GET .../profiles/:userId)
 *
 * There is NO "discover all farmers" list here: the backend
 * (community.routes.js) only exposes single-profile lookup by id, not
 * a paginated user directory. Building a browsable grid would mean
 * either faking data or paging through every user id blindly, both of
 * which violate the "no mock data" rule — so this page is reachable
 * only from a known userId (e.g. a future post-author link), matching
 * what the real API actually supports today, rather than papered over.
 */
export default function Profile() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retryTick, setRetryTick] = useState(0);
  const [editing, setEditing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const isOwnRoute = !userId;

  const load = useCallback(async () => {
    setProfile(null);
    setLoadError('');
    try {
      const path = isOwnRoute ? '/community/profile/me' : `/community/profiles/${userId}`;
      const data = await api.get(path);
      setProfile(data);
    } catch (err) {
      setLoadError(err.message || t('community.errorLoadingProfile'));
    }
  }, [isOwnRoute, userId]);

  useEffect(() => {
    load();
  }, [load, retryTick]);

  async function toggleFollow() {
    if (!profile || profile.isSelf) return;
    setFollowBusy(true);
    try {
      if (profile.isFollowing) {
        await api.delete(`/community/follows/${profile.userId}`);
        setProfile((p) => ({ ...p, isFollowing: false, followerCount: Math.max(0, p.followerCount - 1) }));
      } else {
        await api.post(`/community/follows/${profile.userId}`, {});
        setProfile((p) => ({ ...p, isFollowing: true, followerCount: p.followerCount + 1 }));
      }
    } catch {
      // transient failure — button simply stays in its previous state
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div dir="rtl" className="flex flex-col gap-4 text-right" lang="ar">
      <h1 className="text-xl font-extrabold text-slate-800">{t('community.myProfile')}</h1>

      {!profile && loadError && (
        <Card>
          <ErrorState
            title={loadError.includes('not found') || loadError.includes('غير') ? t('community.profileNotFound') : t('community.errorLoadingProfile')}
            onRetry={() => setRetryTick((n) => n + 1)}
            retryLabel={t('community.retry')}
          />
        </Card>
      )}
      {!profile && !loadError && <Spinner label={t('community.loading')} />}

      {profile && !editing && (
        <ProfileView profile={profile} onEdit={() => setEditing(true)} onToggleFollow={toggleFollow} followBusy={followBusy} />
      )}

      {profile && editing && (
        <ProfileEditForm
          profile={profile}
          onCancel={() => setEditing(false)}
          onSaved={(updated) => {
            setProfile((p) => ({ ...p, ...updated }));
            setEditing(false);
          }}
        />
      )}

      {profile && !isOwnRoute && (
        <button onClick={() => navigate('/community')} className="self-start text-xs font-bold text-slate-400 hover:text-slate-600">
          ← {t('community.title')}
        </button>
      )}
    </div>
  );
}

function ProfileView({ profile, onEdit, onToggleFollow, followBusy }) {
  const verificationTone = profile.verificationStatus === 'verified' ? 'green' : profile.verificationStatus === 'pending' ? 'amber' : 'slate';
  const verificationLabel =
    profile.verificationStatus === 'verified'
      ? t('community.verified')
      : profile.verificationStatus === 'pending'
      ? t('community.pendingVerification')
      : t('community.unverified');

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-lg font-extrabold text-brand-700">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.displayName} className="h-full w-full object-cover" />
            ) : (
              (profile.displayName || '?').charAt(0)
            )}
          </div>
          <div>
            <div className="text-base font-extrabold text-slate-800">{profile.displayName}</div>
            <div className="mt-0.5 flex items-center gap-2">
              <Badge tone={verificationTone}>{verificationLabel}</Badge>
              {(profile.governorate || profile.city) && (
                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                  <MapPin size={12} />
                  {[profile.city, profile.governorate].filter(Boolean).join('، ')}
                </span>
              )}
            </div>
          </div>
        </div>

        {profile.isSelf ? (
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <Pencil size={13} /> {t('community.editProfile')}
          </button>
        ) : (
          <button
            onClick={onToggleFollow}
            disabled={followBusy}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${
              profile.isFollowing ? 'border border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            {followBusy ? <Loader2 size={13} className="animate-spin" /> : profile.isFollowing ? <UserMinus size={13} /> : <UserPlus size={13} />}
            {profile.isFollowing ? t('community.unfollow') : t('community.follow')}
          </button>
        )}
      </div>

      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{profile.bio || t('community.noBio')}</p>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-50 pt-4 text-center">
        <Stat value={profile.followerCount} label={t('community.followers')} />
        <Stat value={profile.followingCount} label={t('community.followingCount')} />
        <Stat value={profile.postCount} label={t('community.posts')} />
      </div>

      <div className="mt-4 border-t border-slate-50 pt-4">
        <div className="text-xs font-bold text-slate-500">{t('community.crops')}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {profile.crops && profile.crops.length > 0 ? (
            profile.crops.map((c) => (
              <Badge key={c} tone="green">
                {c}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-slate-400">{t('community.noCrops')}</span>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs font-bold text-slate-500">{t('community.interests')}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {profile.interests && profile.interests.length > 0 ? (
            profile.interests.map((c) => (
              <Badge key={c} tone="blue">
                {c}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-slate-400">{t('community.noInterests')}</span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-50 pt-3 text-xs text-slate-400">
        {typeof profile.experienceYears === 'number' && (
          <span>
            {t('community.experienceYears')}: {profile.experienceYears}
          </span>
        )}
        <span>
          {t('community.memberSince')} {formatDate(profile.memberSince)}
        </span>
      </div>
    </Card>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <div className="text-lg font-extrabold text-slate-800">{value ?? 0}</div>
      <div className="text-[11px] text-slate-400">{label}</div>
    </div>
  );
}

function TagInput({ value, onChange, placeholder }) {
  const [draft, setDraft] = useState('');

  function addTag(e) {
    e.preventDefault();
    const v = draft.trim();
    if (!v || value.includes(v) || value.length >= 30) {
      setDraft('');
      return;
    }
    onChange([...value, v]);
    setDraft('');
  }

  function removeTag(tag) {
    onChange(value.filter((t2) => t2 !== tag));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span key={tag} className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {tag}
            <button type="button" onClick={() => removeTag(tag)} aria-label={`${t('community.delete')} ${tag}`}>
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={addTag} className="mt-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          maxLength={40}
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-brand-500"
        />
      </form>
    </div>
  );
}

function ProfileEditForm({ profile, onCancel, onSaved }) {
  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || '');
  const [governorate, setGovernorate] = useState(profile.governorate || '');
  const [city, setCity] = useState(profile.city || '');
  const [crops, setCrops] = useState(profile.crops || []);
  const [interests, setInterests] = useState(profile.interests || []);
  const [experienceYears, setExperienceYears] = useState(
    typeof profile.experienceYears === 'number' ? String(profile.experienceYears) : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const updates = {};
    if (displayName.trim()) updates.displayName = displayName.trim();
    if (bio.trim()) updates.bio = bio.trim();
    if (avatarUrl.trim()) updates.avatarUrl = avatarUrl.trim();
    if (governorate.trim()) updates.governorate = governorate.trim();
    if (city.trim()) updates.city = city.trim();
    updates.crops = crops;
    updates.interests = interests;
    if (experienceYears !== '') {
      const n = Number(experienceYears);
      if (!Number.isNaN(n)) updates.experienceYears = n;
    }
    try {
      const updated = await api.patch('/community/profile/me', updates);
      onSaved(updated);
    } catch (err) {
      setError(err.message || 'تعذّر حفظ التغييرات.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={t('community.displayName')}>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={80}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </Field>

        <Field label={t('community.bio')}>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={500}
            className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-brand-500"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('community.governorateLabel')}>
            <input
              value={governorate}
              onChange={(e) => setGovernorate(e.target.value)}
              maxLength={60}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </Field>
          <Field label={t('community.cityLabel')}>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={60}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </Field>
        </div>

        <Field label={t('community.experienceYears')}>
          <input
            type="number"
            min="0"
            max="100"
            value={experienceYears}
            onChange={(e) => setExperienceYears(e.target.value)}
            className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </Field>

        <Field label={t('community.crops')}>
          <TagInput value={crops} onChange={setCrops} placeholder={t('community.addTagPlaceholder')} />
        </Field>

        <Field label={t('community.interests')}>
          <TagInput value={interests} onChange={setInterests} placeholder={t('community.addTagPlaceholder')} />
        </Field>

        <Field label="رابط الصورة (اختياري)">
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            maxLength={500}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </Field>

        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</div>}

        <div className="flex items-center justify-end gap-2 border-t border-slate-50 pt-3">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50">
            {t('community.cancel')}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {busy ? t('community.savingProfile') : t('community.saveProfile')}
          </button>
        </div>
      </form>
    </Card>
  );
}

function Field({ label, children }) {
  return (
    <div>
      {label && <label className="mb-1 block text-xs font-bold text-slate-500">{label}</label>}
      {children}
    </div>
  );
}
