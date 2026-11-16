import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import {
  auth,
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import type { SupportedLanguage, UserProfile } from '../types/civic';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  authLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (params: {
    name: string;
    email: string;
    password: string;
    city: string;
    preferredLanguage: SupportedLanguage;
  }) => Promise<void>;
  resendVerification: () => Promise<void>;
  refreshVerificationStatus: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  updateUserSettings: (updates: {
    displayName: string;
    city: string;
    preferredLanguage: SupportedLanguage;
  }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function tsToMillis(value: unknown): number {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }
  return Date.now();
}

function mapFirebaseAuthError(err: unknown, fallback: string): string {
  const code = (err as { code?: string })?.code || '';
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not yet allowlisted in Firebase Authentication > Settings > Authorized domains.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Console > Authentication > Sign-in method. Please use Google Sign-In or enable Email/Password in Firebase Console.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email address or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Please choose at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many authentication attempts. Please wait a few minutes and try again.';
    default:
      return err instanceof Error ? err.message : fallback;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadUserAndRole = async (firebaseUser: User) => {
    const userPath = `users/${firebaseUser.uid}`;
    const userRef = doc(db, 'users', firebaseUser.uid);

    let userSnap;
    try {
      userSnap = await getDoc(userRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, userPath);
    }

    let adminFlag = false;
    if (
      firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() &&
      firebaseUser.emailVerified
    ) {
      adminFlag = true;
    } else if (firebaseUser.emailVerified) {
      const adminPath = `admins/${firebaseUser.uid}`;
      try {
        const adminSnap = await getDoc(doc(db, 'admins', firebaseUser.uid));
        adminFlag = adminSnap.exists();
      } catch (error) {
        console.warn('Admin check returned error:', error);
        adminFlag = false;
      }
    }
    setIsAdmin(adminFlag);

    if (!userSnap.exists()) {
      const defaultName =
        firebaseUser.displayName?.trim() ||
        firebaseUser.email?.split('@')[0] ||
        'Citizen Reporter';
      const newProfileData = {
        uid: firebaseUser.uid,
        displayName: defaultName.slice(0, 80),
        email: (firebaseUser.email || '').slice(0, 160),
        city: 'Hyderabad',
        preferredLanguage: 'en' as SupportedLanguage,
        role: adminFlag ? ('admin' as const) : ('citizen' as const),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      try {
        await setDoc(userRef, newProfileData);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, userPath);
      }
      setProfile({
        uid: firebaseUser.uid,
        displayName: newProfileData.displayName,
        email: newProfileData.email,
        city: 'Hyderabad',
        preferredLanguage: 'en',
        role: newProfileData.role,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      });
    } else {
      const data = userSnap.data() as Record<string, unknown>;
      setProfile({
        uid: String(data.uid || firebaseUser.uid),
        displayName: String(data.displayName || firebaseUser.displayName || 'Citizen'),
        email: data.email ? String(data.email) : undefined,
        city: String(data.city || 'Hyderabad'),
        preferredLanguage: (data.preferredLanguage as SupportedLanguage) || 'en',
        role: adminFlag ? 'admin' : ((data.role as 'citizen' | 'admin') || 'citizen'),
        createdAtMs: tsToMillis(data.createdAt),
        updatedAtMs: tsToMillis(data.updatedAt),
      });
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setIsAdmin(false);
        setAuthLoading(false);
        return;
      }

      try {
        await loadUserAndRole(firebaseUser);
      } catch (error) {
        console.error('Error loading user profile:', error);
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const clearAuthError = () => setAuthError(null);

  const signInWithGoogle = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err, 'Google sign-in failed.'));
      throw err;
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err, 'Email sign-in failed.'));
      throw err;
    }
  };

  const signUpWithEmail = async (params: {
    name: string;
    email: string;
    password: string;
    city: string;
    preferredLanguage: SupportedLanguage;
  }) => {
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
      await updateProfile(cred.user, { displayName: params.name.trim().slice(0, 80) });
      await sendEmailVerification(cred.user);
      const path = `users/${cred.user.uid}`;
      try {
        await setDoc(doc(db, 'users', cred.user.uid), {
          uid: cred.user.uid,
          displayName: params.name.trim().slice(0, 80),
          email: params.email.trim().slice(0, 160),
          city: params.city.trim().slice(0, 60) || 'Hyderabad',
          preferredLanguage: params.preferredLanguage,
          role: 'citizen',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.CREATE, path);
      }
    } catch (err) {
      setAuthError(mapFirebaseAuthError(err, 'Account creation failed.'));
      throw err;
    }
  };

  const resendVerification = async () => {
    if (auth.currentUser && !auth.currentUser.emailVerified) {
      await sendEmailVerification(auth.currentUser);
    }
  };

  const refreshVerificationStatus = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    const refreshed = auth.currentUser;
    setUser(refreshed);
    if (refreshed.emailVerified) {
      await loadUserAndRole(refreshed);
    }
    return refreshed.emailVerified;
  };

  const signOutUser = async () => {
    setAuthError(null);
    await signOut(auth);
  };

  const updateUserSettings = async (updates: {
    displayName: string;
    city: string;
    preferredLanguage: SupportedLanguage;
  }) => {
    if (!user) return;
    const path = `users/${user.uid}`;
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: updates.displayName.trim().slice(0, 80),
        city: updates.city.trim().slice(0, 60) || 'Hyderabad',
        preferredLanguage: updates.preferredLanguage,
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              displayName: updates.displayName.trim().slice(0, 80),
              city: updates.city.trim().slice(0, 60) || 'Hyderabad',
              preferredLanguage: updates.preferredLanguage,
              updatedAtMs: Date.now(),
            }
          : prev,
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        authLoading,
        authError,
        clearAuthError,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resendVerification,
        refreshVerificationStatus,
        signOutUser,
        updateUserSettings,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
