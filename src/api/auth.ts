import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  updatePassword as firebaseUpdatePassword,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from '../config/firebase';
import type { User, Session, AuthResponse, AuthError } from '../types';

function mapFirebaseUser(firebaseUser: FirebaseUser): User {
  return {
    id: firebaseUser.uid,
    email: firebaseUser.email || '',
    created_at: firebaseUser.metadata.creationTime || new Date().toISOString(),
  };
}

function createSession(firebaseUser: FirebaseUser): Session {
  return {
    access_token: firebaseUser.uid,
    refresh_token: '',
    expires_at: Date.now() + 3600000,
    user: mapFirebaseUser(firebaseUser),
  };
}

export async function getSession(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      unsubscribe();
      resolve(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
    });
  });
}

export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, (firebaseUser) => {
    callback(firebaseUser ? mapFirebaseUser(firebaseUser) : null);
  });
}

export async function signUp(email: string, password: string): Promise<AuthResponse> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = mapFirebaseUser(userCredential.user);
    const session = createSession(userCredential.user);

    return {
      user,
      session,
      error: null,
    };
  } catch (error: any) {
    let message = 'Sign up failed';
    const code = error.code || 'signup_error';

    switch (code) {
      case 'auth/email-already-in-use':
        message = 'An account with this email already exists. Please sign in instead.';
        break;
      case 'auth/invalid-email':
        message = 'Please enter a valid email address.';
        break;
      case 'auth/weak-password':
        message = 'Password must be at least 6 characters long.';
        break;
      case 'auth/operation-not-allowed':
        message = 'Email/password sign up is not enabled. Please contact support.';
        break;
      default:
        message = error.message || 'Sign up failed. Please try again.';
    }

    const authError: AuthError = { message, code };
    return {
      user: null,
      session: null,
      error: authError,
    };
  }
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResponse> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = mapFirebaseUser(userCredential.user);
    const session = createSession(userCredential.user);

    return {
      user,
      session,
      error: null,
    };
  } catch (error: any) {
    let message = 'Sign in failed';
    const code = error.code || 'signin_error';

    switch (code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        message = 'Invalid email or password';
        break;
      case 'auth/invalid-email':
        message = 'Please enter a valid email address.';
        break;
      case 'auth/user-disabled':
        message = 'This account has been disabled. Please contact support.';
        break;
      case 'auth/too-many-requests':
        message = 'Too many failed attempts. Please try again later.';
        break;
      default:
        message = error.message || 'Sign in failed. Please try again.';
    }

    const authError: AuthError = { message, code };
    return {
      user: null,
      session: null,
      error: authError,
    };
  }
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  try {
    await firebaseSignOut(auth);
    return { error: null };
  } catch (error: any) {
    return { error: { message: error.message || 'Sign out failed' } };
  }
}

export async function resetPasswordForEmail(
  email: string,
  redirectTo: string | null = null
): Promise<{ error: AuthError | null }> {
  try {
    await sendPasswordResetEmail(auth, email);
    return { error: null };
  } catch (error: any) {
    return { error: { message: error.message || 'Password reset failed' } };
  }
}

export async function updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { error: { message: 'No user logged in' } };
    }
    await firebaseUpdatePassword(user, newPassword);
    return { error: null };
  } catch (error: any) {
    return { error: { message: error.message || 'Password update failed' } };
  }
}
