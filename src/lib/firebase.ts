import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import type { CivicIssue } from './types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
} as const;

export type OperationTypeValue = (typeof OperationType)[keyof typeof OperationType];

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationTypeValue;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{ providerId?: string | null; email?: string | null }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationTypeValue,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    return false;
  }
}

export async function signInWithGoogleCitizen() {
  const credential = await signInWithPopup(auth, googleAuthProvider);
  const fbUser = credential.user;
  const userPath = `users/${fbUser.uid}`;
  try {
    await setDoc(
      doc(db, 'users', fbUser.uid),
      {
        uid: fbUser.uid,
        email: fbUser.email || '',
        fullName: fbUser.displayName || 'Citizen User',
        role: 'citizen',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    // Profile creation/update logged without blocking local session sync
    console.warn('Firestore user profile sync note:', error);
  }
  return {
    uid: fbUser.uid,
    email: fbUser.email || '',
    fullName: fbUser.displayName || 'Citizen User',
    userPath,
  };
}

export async function signOutFirebaseIfActive() {
  if (auth.currentUser) {
    await signOut(auth);
  }
}

export async function syncIssueToFirestore(issue: CivicIssue): Promise<void> {
  if (!auth.currentUser) return;
  const path = `issues/${issue.complaintCode}`;
  try {
    await setDoc(doc(db, 'issues', issue.complaintCode), {
      complaintCode: issue.complaintCode,
      reporterUid: auth.currentUser.uid,
      title: issue.title,
      description: issue.description,
      category: issue.category,
      severity: issue.severity,
      status: issue.status,
      municipalityName: issue.municipalityName,
      districtName: issue.districtName,
      stateName: issue.stateName,
      departmentName: issue.departmentName || 'Manual Review Queue',
      latitude: issue.latitude,
      longitude: issue.longitude,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
