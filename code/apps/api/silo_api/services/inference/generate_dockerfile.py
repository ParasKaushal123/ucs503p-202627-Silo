from pathlib import Path

from jinja2 import Template

_TEMPLATE_PATH = (
    Path(__file__).resolve().parent.parent.parent.parent / "templates" / "Dockerfile.j2"
)
_TEMPLATE = _TEMPLATE_PATH.read_text()


def generate_dockerfile(
    python_version: str,
    entrypoint: str,
    port: int,
    packages: list[str],
    has_requirements_txt: bool,
) -> str:
    """Render a Dockerfile from the inferred parameters."""
    tmpl = Template(_TEMPLATE)
    return tmpl.render(
        python_version=python_version,
        entrypoint=entrypoint,
        port=port,
        packages=packages,
        has_requirements_txt=has_requirements_txt,
    )
