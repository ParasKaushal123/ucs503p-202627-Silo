"""Security track: every build of an app as a timeline of rule-based analyses."""

from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..config import settings
from ..db import get_db
from ..models import App, Release, Version
from ..services import security
from ..services.access import app_access
from ..services.workspace import display_user
from .apps import get_current_user_id

router = APIRouter(tags=["security"])


@lru_cache(maxsize=1)
def _semgrep_version() -> str | None:
    return security.semgrep_version()


def engine_info() -> dict:
    version = _semgrep_version() if settings.security_semgrep else None
    return {
        "semgrep": version,
        "label": f"Semgrep {version} + Silo rules" if version else "Silo rules",
    }


def _build_source(db, app: App, version: Version):
    """The files of one build, where they came from, and who made it."""
    release = db.scalar(select(Release).where(Release.version_id == version.id))
    files = security.files_from_release(release.files_json) if release else {}
    if not files and version.bundle_path:
        files = security.files_from_directory(Path(version.bundle_path))
    uploaded = release is None or release.label.startswith("Uploaded")
    actor = release.actor_id if release else app.owner_id
    return {
        "files": files,
        "kind": "upload" if uploaded else "workbench",
        "label": release.label if release else f"Uploaded v{version.version_no}",
        "release_id": release.id if release else None,
        "published": bool(release and app.approved_version_id == release.id),
        "actor": display_user(db, actor),
    }


def _timeline(db, app: App) -> tuple[list[dict], list[dict], list[dict]]:
    versions = list(
        db.scalars(select(Version).where(Version.app_id == app.id).order_by(Version.version_no))
    )
    sources = [_build_source(db, app, v) for v in versions]
    file_sets = [s["files"] for s in sources]
    semgrep = (
        security.semgrep_findings(file_sets)
        if settings.security_semgrep
        else [None] * len(file_sets)
    )
    analyses = [security.analyze(files, found) for files, found in zip(file_sets, semgrep)]
    nodes = []
    for index, (version, source, analysis) in enumerate(zip(versions, sources, analyses)):
        node = {
            "version_id": version.id,
            "version_no": version.version_no,
            "status": version.status,
            "created_at": version.created_at.isoformat(),
            "kind": source["kind"],
            "label": source["label"],
            "release_id": source["release_id"],
            "published": source["published"],
            "actor": source["actor"],
            "source_available": bool(source["files"]),
            "risk": analysis["risk"],
            "counts": analysis["counts"],
            "capabilities": len(analysis["capabilities"]),
            "dependencies": len(analysis["dependencies"]),
            "origin": index == 0,
            # For the capability matrix: what this build can reach.
            "capability_keys": [c["key"] for c in analysis["capabilities"]],
        }
        if index:
            change = security.compare(
                file_sets[index - 1], source["files"], analyses[index - 1], analysis
            )
            node.update(
                {
                    "classification": change["classification"],
                    "files_changed": len(change["files"]),
                    "capabilities_added": len(change["capabilities_added"]),
                    "capabilities_removed": len(change["capabilities_removed"]),
                    "findings_new": len(change["findings_new"]),
                    "findings_fixed": len(change["findings_fixed"]),
                    # The graph's child nodes: what this build changed, worst first.
                    "items": [
                        *(
                            {
                                "type": "access",
                                "id": c["key"],
                                "title": c["label"],
                                "detail": c["detail"],
                                "tone": c["tone"],
                            }
                            for c in change["capabilities_added"]
                        ),
                        *(
                            {
                                "type": "finding",
                                "id": f["fingerprint"],
                                "title": f["title"],
                                "detail": f"{f['file']}:{f['line']}",
                                "tone": f["severity"],
                            }
                            for f in change["findings_new"]
                        ),
                        *(
                            {
                                "type": "fixed",
                                "id": f["fingerprint"],
                                "title": f["title"],
                                "detail": f"{f['file']}:{f['line']}",
                                "tone": "fixed",
                            }
                            for f in change["findings_fixed"]
                        ),
                        *(
                            {
                                "type": "dependency",
                                "id": "dep:" + d["name"],
                                "title": d["name"],
                                "detail": d["version"],
                                "tone": "dependency",
                            }
                            for d in change["dependencies_added"]
                        ),
                    ],
                }
            )
        else:
            node["classification"] = "origin"
            node["items"] = [
                {
                    "type": "access",
                    "id": c["key"],
                    "title": c["label"],
                    "detail": c["detail"],
                    "tone": c["tone"],
                }
                for c in analysis["capabilities"]
            ]
        nodes.append(node)
    return nodes, sources, analyses


@router.get("/apps/{app_id}/security")
def security_track(app_id: str, user_id=Depends(get_current_user_id), db=Depends(get_db)):
    app, role = app_access(db, app_id, user_id)
    nodes, _, analyses = _timeline(db, app)
    latest = analyses[-1] if analyses else None
    capabilities = {}
    for analysis in analyses:
        for c in analysis["capabilities"]:
            capabilities.setdefault(c["key"], {k: c[k] for k in ("key", "label", "detail", "tone")})
    return {
        "app": {"id": app.id, "name": app.name},
        # Rows of the capability matrix, in the order they first appeared.
        "capabilities": list(capabilities.values()),
        "role": role,
        "engine": engine_info(),
        "nodes": nodes,
        "summary": {
            "builds": len(nodes),
            "risk": latest["risk"] if latest else 0,
            "risk_trend": [n["risk"] for n in nodes],
            "counts": latest["counts"] if latest else {s: 0 for s in security.SEVERITY_ORDER},
            "capabilities": len(latest["capabilities"]) if latest else 0,
            "dependencies": len(latest["dependencies"]) if latest else 0,
            "expanding": sum(1 for n in nodes if n["classification"] == "expanding"),
        },
    }


@router.get("/apps/{app_id}/security/{version_id}")
def security_node(
    app_id: str,
    version_id: str,
    compare_to: str | None = None,
    user_id=Depends(get_current_user_id),
    db=Depends(get_db),
):
    app, _ = app_access(db, app_id, user_id)
    nodes, sources, analyses = _timeline(db, app)
    index = next((i for i, n in enumerate(nodes) if n["version_id"] == version_id), None)
    if index is None:
        raise HTTPException(404, "Build not found")
    base = (
        index - 1
        if compare_to is None
        else next((i for i, n in enumerate(nodes) if n["version_id"] == compare_to), None)
    )
    if compare_to is not None and base is None:
        raise HTTPException(404, "Comparison build not found")
    diff = None
    if base is not None and base >= 0 and base != index:
        diff = security.compare(
            sources[base]["files"], sources[index]["files"], analyses[base], analyses[index]
        )
        diff["base"] = {
            "version_id": nodes[base]["version_id"],
            "version_no": nodes[base]["version_no"],
        }
    analysis = analyses[index]
    return {
        "node": nodes[index],
        "label": {
            "capabilities": analysis["capabilities"],
            "dependencies": analysis["dependencies"],
            "files": analysis["files"],
            "lines": analysis["lines"],
            "languages": analysis["languages"],
            "manifest_digest": analysis["manifest_digest"],
            "risk": analysis["risk"],
            "counts": analysis["counts"],
        },
        "findings": analysis["findings"],
        "engines": analysis["engines"],
        "diff": diff,
        "files": sorted(sources[index]["files"]),
    }


def finding_prompt(finding: dict) -> str:
    """The change request sent to the AI collaborator for one rule finding."""
    return (
        f"Fix this security finding without changing what the app does. "
        f"Rule {finding['rule_id']} ({finding['cwe']}, {finding['severity']}): "
        f"{finding['title']} in {finding['file']} line {finding['line']}. "
        f"Why it matters: {finding['why']} Suggested fix: {finding['fix']}"
    )


class FixInput(BaseModel):
    fingerprint: str = Field(min_length=1, max_length=40)


@router.post("/apps/{app_id}/security/{version_id}/fix", status_code=201)
def fix_with_ai(
    app_id: str,
    version_id: str,
    body: FixInput,
    tasks: BackgroundTasks,
    user_id=Depends(get_current_user_id),
    db=Depends(get_db),
):
    """Ask the AI collaborator for a reviewable fix of one finding.

    The fix is proposed against the shared draft (the current code), so it goes
    through the Workbench's normal diff review before anyone applies it.
    """
    from .proposals import ProposalInput, create_proposal
    from .workbench import ensure_draft

    app, _ = app_access(db, app_id, user_id, "editor")
    nodes, _, analyses = _timeline(db, app)
    index = next((i for i, n in enumerate(nodes) if n["version_id"] == version_id), None)
    if index is None:
        raise HTTPException(404, "Build not found")
    finding = next(
        (f for f in analyses[index]["findings"] if f["fingerprint"] == body.fingerprint), None
    )
    if finding is None:
        raise HTTPException(404, "Finding not found in this build")
    draft = ensure_draft(app_id, user_id, db)
    proposal = create_proposal(
        draft["id"],
        ProposalInput(prompt=finding_prompt(finding), expected_hash=draft["source_hash"]),
        tasks,
        user_id,
        db,
    )
    return {"proposal": proposal, "draft_id": draft["id"]}
