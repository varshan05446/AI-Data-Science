"""Interactive Explore endpoints: chart catalog + on-demand chart builder.

These are additive to the automatic ``/eda`` endpoint. The catalog powers the
customization controls; the builder renders one user-configured chart at a time
(Plotly spec or Seaborn/Matplotlib base64 image).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.resources import get_owned_dataset
from app.core.database import get_db
from app.models import Dataset
from app.schemas import ChartBuildSpec, ChartResultOut, ExplorationCatalogOut
from app.services.data.viz import build_chart, catalog_for_dataframe
from app.services.data.viz.builder import ChartBuildError
from app.services.data.viz.map_builder import MapBuildError
from app.services.dataset_io import read_dataset_dataframe

router = APIRouter(tags=["exploration"])


def _load_df(dataset: Dataset):
    try:
        return read_dataset_dataframe(dataset)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Dataset file not found in storage"
        )


@router.get("/datasets/{dataset_id}/exploration/catalog", response_model=ExplorationCatalogOut)
def exploration_catalog(
    dataset: Dataset = Depends(get_owned_dataset), db: Session = Depends(get_db)
) -> ExplorationCatalogOut:
    df = _load_df(dataset)
    catalog = catalog_for_dataframe(df)
    return ExplorationCatalogOut(dataset_id=dataset.id, **catalog)


@router.post("/datasets/{dataset_id}/exploration/chart", response_model=ChartResultOut)
def exploration_chart(
    spec: ChartBuildSpec,
    dataset: Dataset = Depends(get_owned_dataset),
    db: Session = Depends(get_db),
) -> ChartResultOut:
    df = _load_df(dataset)
    try:
        chart = build_chart(df, spec.chart_type, spec.encodings, spec.options)
    except (ChartBuildError, MapBuildError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except RuntimeError as exc:  # optional-dependency missing
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception as exc:  # noqa: BLE001 - surface a clean message to the UI
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not build chart: {exc}",
        )
    return ChartResultOut(dataset_id=dataset.id, chart=chart)
