from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from passlib.context import CryptContext
from psycopg.rows import dict_row
from pydantic import BaseModel, Field


# ============================================================
# AURA HEALTHCARE MANAGEMENT PLATFORM
# Backend Foundation
# ============================================================

APP_NAME = "AURA Healthcare Management Platform"
APP_VERSION = "1.0.0"

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://aura:aura@localhost:5432/aura",
)

JWT_SECRET = os.getenv(
    "AURA_JWT_SECRET",
    "CHANGE_THIS_SECRET_IN_PRODUCTION",
)

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_MINUTES = 60

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    description="AURA clinical and healthcare management API.",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# DATABASE
# ============================================================

def get_connection():
    return psycopg.connect(
        DATABASE_URL,
        row_factory=dict_row,
    )


# ============================================================
# SECURITY
# ============================================================

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(
    plain_password: str,
    password_hash: str,
) -> bool:
    return pwd_context.verify(
        plain_password,
        password_hash,
    )


def create_access_token(
    user_id: UUID,
    organization_id: UUID,
) -> str:

    now = datetime.now(timezone.utc)

    payload = {
        "sub": str(user_id),
        "organization_id": str(organization_id),
        "iat": now,
        "exp": now + timedelta(
            minutes=JWT_EXPIRATION_MINUTES
        ),
    }

    return jwt.encode(
        payload,
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> dict[str, Any]:

    try:
        return jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
        )

    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token.",
        ) from exc


# ============================================================
# AUTHENTICATED CONTEXT
# ============================================================

class AuthContext(BaseModel):
    user_id: UUID
    organization_id: UUID


def require_authentication(
    authorization: str | None = Header(default=None),
) -> AuthContext:

    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    scheme, _, token = authorization.partition(" ")

    if scheme.lower() != "bearer" or not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer authentication required.",
        )

    payload = decode_access_token(token)

    try:
        return AuthContext(
            user_id=UUID(payload["sub"]),
            organization_id=UUID(
                payload["organization_id"]
            ),
        )

    except (KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication context.",
        ) from exc


# ============================================================
# AUDIT / PROVENANCE
# ============================================================

def write_audit_event(
    connection,
    *,
    organization_id: UUID,
    actor_user_id: UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None,
    details: dict[str, Any] | None = None,
) -> None:

    connection.execute(
        """
        INSERT INTO audit_events (
            id,
            organization_id,
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details,
            occurred_at
        )
        VALUES (
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            NOW()
        )
        """,
        (
            uuid4(),
            organization_id,
            actor_user_id,
            action,
            entity_type,
            entity_id,
            details or {},
        ),
    )


def write_provenance_record(
    connection,
    *,
    organization_id: UUID,
    actor_user_id: UUID | None,
    entity_type: str,
    entity_id: UUID,
    activity: str,
) -> None:

    connection.execute(
        """
        INSERT INTO provenance_records (
            id,
            organization_id,
            actor_user_id,
            entity_type,
            entity_id,
            activity,
            recorded_at
        )
        VALUES (
            %s,
            %s,
            %s,
            %s,
            %s,
            %s,
            NOW()
        )
        """,
        (
            uuid4(),
            organization_id,
            actor_user_id,
            entity_type,
            entity_id,
            activity,
        ),
    )


# ============================================================
# REQUEST MODELS
# ============================================================

class HealthResponse(BaseModel):
    status: str
    application: str
    version: str


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    expires_in: int


class PatientCreate(BaseModel):
    given_name: str = Field(min_length=1)
    family_name: str = Field(min_length=1)
    date_of_birth: str | None = None
    sex: str | None = None


class WalkInCheckInRequest(BaseModel):
    location_id: UUID
    queue_id: UUID
    reason: str | None = None


class QueueTransitionRequest(BaseModel):
    reason: str | None = None


# ============================================================
# HEALTH
# ============================================================

@app.get(
    "/health",
    response_model=HealthResponse,
)
def health_check():

    return HealthResponse(
        status="ok",
        application=APP_NAME,
        version=APP_VERSION,
    )


# ============================================================
# AUTHENTICATION
# ============================================================

@app.post(
    "/v1/auth/login",
    response_model=LoginResponse,
)
def login(request: LoginRequest):

    with get_connection() as connection:

        user = connection.execute(
            """
            SELECT
                id,
                organization_id,
                password_hash,
                status
            FROM user_accounts
            WHERE username = %s
            LIMIT 1
            """,
            (request.username,),
        ).fetchone()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password.",
            )

        if user["status"] != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is not active.",
            )

        if not verify_password(
            request.password,
            user["password_hash"],
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password.",
            )

        token = create_access_token(
            user_id=user["id"],
            organization_id=user["organization_id"],
        )

        return LoginResponse(
            access_token=token,
            token_type="bearer",
            expires_in=JWT_EXPIRATION_MINUTES * 60,
        )


# ============================================================
# CURRENT USER
# ============================================================

@app.get("/v1/auth/me")
def current_user(
    auth: AuthContext = Depends(
        require_authentication
    ),
):

    with get_connection() as connection:

        user = connection.execute(
            """
            SELECT
                id,
                organization_id,
                username,
                status
            FROM user_accounts
            WHERE id = %s
              AND organization_id = %s
            """,
            (
                auth.user_id,
                auth.organization_id,
            ),
        ).fetchone()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User account not found.",
            )

        return user


# ============================================================
# PATIENT REGISTRATION
# ============================================================

@app.post("/v1/patients")
def create_patient(
    request: PatientCreate,
    auth: AuthContext = Depends(
        require_authentication
    ),
):

    patient_id = uuid4()
    person_id = uuid4()

    with get_connection() as connection:

        try:

            connection.execute(
                """
                INSERT INTO persons (
                    id,
                    organization_id,
                    given_name,
                    family_name,
                    date_of_birth,
                    sex,
                    created_at,
                    updated_at
                )
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    NOW(),
                    NOW()
                )
                """,
                (
                    person_id,
                    auth.organization_id,
                    request.given_name,
                    request.family_name,
                    request.date_of_birth,
                    request.sex,
                ),
            )

            connection.execute(
                """
                INSERT INTO patients (
                    id,
                    organization_id,
                    person_id,
                    status,
                    created_at,
                    updated_at
                )
                VALUES (
                    %s,
                    %s,
                    %s,
                    'ACTIVE',
                    NOW(),
                    NOW()
                )
                """,
                (
                    patient_id,
                    auth.organization_id,
                    person_id,
                ),
            )

            write_provenance_record(
                connection,
                organization_id=auth.organization_id,
                actor_user_id=auth.user_id,
                entity_type="Patient",
                entity_id=patient_id,
                activity="patient-registration",
            )

            write_audit_event(
                connection,
                organization_id=auth.organization_id,
                actor_user_id=auth.user_id,
                action="CREATE",
                entity_type="Patient",
                entity_id=patient_id,
            )

            connection.commit()

        except Exception:
            connection.rollback()
            raise

    return {
        "patient_id": patient_id,
        "person_id": person_id,
        "status": "ACTIVE",
    }


# ============================================================
# PATIENT LIST
# ============================================================

@app.get("/v1/patients")
def list_patients(
    auth: AuthContext = Depends(
        require_authentication
    ),
):

    with get_connection() as connection:

        rows = connection.execute(
            """
            SELECT
                p.id AS patient_id,
                p.person_id,
                pe.given_name,
                pe.family_name,
                pe.date_of_birth,
                pe.sex,
                p.status
            FROM patients p
            JOIN persons pe
              ON pe.id = p.person_id
             AND pe.organization_id = p.organization_id
            WHERE p.organization_id = %s
            ORDER BY pe.family_name, pe.given_name
            """,
            (auth.organization_id,),
        ).fetchall()

        return rows


# ============================================================
# WALK-IN CHECK-IN
# ============================================================

@app.post(
    "/v1/patients/{patient_id}/check-ins"
)
def create_walk_in_check_in(
    patient_id: UUID,
    request: WalkInCheckInRequest,
    auth: AuthContext = Depends(
        require_authentication
    ),
):

    check_in_id = uuid4()
    queue_entry_id = uuid4()

    with get_connection() as connection:

        try:

            patient = connection.execute(
                """
                SELECT id
                FROM patients
                WHERE id = %s
                  AND organization_id = %s
                  AND status = 'ACTIVE'
                """,
                (
                    patient_id,
                    auth.organization_id,
                ),
            ).fetchone()

            if not patient:
                raise HTTPException(
                    status_code=404,
                    detail="Patient not found.",
                )

            connection.execute(
                """
                INSERT INTO check_ins (
                    id,
                    organization_id,
                    patient_id,
                    location_id,
                    check_in_type,
                    reason,
                    checked_in_at,
                    created_at
                )
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    'WALK_IN',
                    %s,
                    NOW(),
                    NOW()
                )
                """,
                (
                    check_in_id,
                    auth.organization_id,
                    patient_id,
                    request.location_id,
                    request.reason,
                ),
            )

            connection.execute(
                """
                INSERT INTO queue_entries (
                    id,
                    organization_id,
                    queue_id,
                    patient_id,
                    check_in_id,
                    status,
                    queued_at,
                    created_at
                )
                VALUES (
                    %s,
                    %s,
                    %s,
                    %s,
                    %s,
                    'WAITING',
                    NOW(),
                    NOW()
                )
                """,
                (
                    queue_entry_id,
                    auth.organization_id,
                    request.queue_id,
                    patient_id,
                    check_in_id,
                ),
            )

            write_provenance_record(
                connection,
                organization_id=auth.organization_id,
                actor_user_id=auth.user_id,
                entity_type="CheckIn",
                entity_id=check_in_id,
                activity="walk-in-check-in",
            )

            write_audit_event(
                connection,
                organization_id=auth.organization_id,
                actor_user_id=auth.user_id,
                action="CREATE",
                entity_type="CheckIn",
                entity_id=check_in_id,
            )

            connection.commit()

        except HTTPException:
            connection.rollback()
            raise

        except Exception:
            connection.rollback()
            raise

    return {
        "check_in_id": check_in_id,
        "queue_entry_id": queue_entry_id,
        "status": "WAITING",
    }


# ============================================================
# QUEUE TRANSITIONS
# ============================================================

QUEUE_TRANSITIONS = {
    "WAITING": {"CALLED"},
    "CALLED": {"IN_SERVICE"},
    "IN_SERVICE": {"COMPLETED"},
}


def transition_queue_entry(
    queue_entry_id: UUID,
    target_status: str,
    auth: AuthContext,
):

    with get_connection() as connection:

        try:

            entry = connection.execute(
                """
                SELECT
                    id,
                    organization_id,
                    patient_id,
                    status
                FROM queue_entries
                WHERE id = %s
                  AND organization_id = %s
                FOR UPDATE
                """,
                (
                    queue_entry_id,
                    auth.organization_id,
                ),
            ).fetchone()

            if not entry:
                raise HTTPException(
                    status_code=404,
                    detail="Queue entry not found.",
                )

            current_status = entry["status"]

            allowed = QUEUE_TRANSITIONS.get(
                current_status,
                set(),
            )

            if target_status not in allowed:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Invalid queue transition: "
                        f"{current_status} -> "
                        f"{target_status}"
                    ),
                )

            connection.execute(
                """
                UPDATE queue_entries
                SET
                    status = %s,
                    updated_at = NOW()
                WHERE id = %s
                  AND organization_id = %s
                """,
                (
                    target_status,
                    queue_entry_id,
                    auth.organization_id,
                ),
            )

            write_provenance_record(
                connection,
                organization_id=auth.organization_id,
                actor_user_id=auth.user_id,
                entity_type="QueueEntry",
                entity_id=queue_entry_id,
                activity=(
                    f"queue-transition:"
                    f"{current_status}-"
                    f">{target_status}"
                ),
            )

            write_audit_event(
                connection,
                organization_id=auth.organization_id,
                actor_user_id=auth.user_id,
                action="STATE_CHANGE",
                entity_type="QueueEntry",
                entity_id=queue_entry_id,
                details={
                    "from": current_status,
                    "to": target_status,
                },
            )

            connection.commit()

            return {
                "queue_entry_id": queue_entry_id,
                "previous_status": current_status,
                "status": target_status,
            }

        except HTTPException:
            connection.rollback()
            raise

        except Exception:
            connection.rollback()
            raise


@app.post(
    "/v1/queue-entries/{queue_entry_id}/call"
)
def call_queue_entry(
    queue_entry_id: UUID,
    request: QueueTransitionRequest,
    auth: AuthContext = Depends(
        require_authentication
    ),
):

    return transition_queue_entry(
        queue_entry_id,
        "CALLED",
        auth,
    )


@app.post(
    "/v1/queue-entries/{queue_entry_id}/start-service"
)
def start_queue_service(
    queue_entry_id: UUID,
    request: QueueTransitionRequest,
    auth: AuthContext = Depends(
        require_authentication
    ),
):

    return transition_queue_entry(
        queue_entry_id,
        "IN_SERVICE",
        auth,
    )


@app.post(
    "/v1/queue-entries/{queue_entry_id}/complete"
)
def complete_queue_entry(
    queue_entry_id: UUID,
    request: QueueTransitionRequest,
    auth: AuthContext = Depends(
        require_authentication
    ),
):

    return transition_queue_entry(
        queue_entry_id,
        "COMPLETED",
        auth,
    )


# ============================================================
# APPLICATION ROOT
# ============================================================

@app.get("/")
def root():

    return {
        "application": APP_NAME,
        "version": APP_VERSION,
        "status": "running",
        "api": "/v1",
        "health": "/health",
    }