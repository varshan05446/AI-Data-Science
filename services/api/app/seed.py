"""Seed script: create a demo workspace, user, project and a profiled dataset.

Run with:  python -m app.seed

Idempotent-ish: if the demo user already exists it is reused. Generates a
synthetic but realistic sales dataset (with some missing values, duplicates and
outliers) so the profiling, EDA, insights and chat features have something to
work with immediately.
"""
from __future__ import annotations

import io

import numpy as np
import pandas as pd
from sqlalchemy import select

from app.core.database import SessionLocal, init_db
from app.core.security import hash_password
from app.models import Dataset, Membership, ProfileReport, Project, User, Workspace
from app.models.base import DatasetStatus, ProjectStatus, Role
from app.services.data.profiling import profile_dataframe
from app.services.storage import get_storage

DEMO_EMAIL = "demo@datamind.ai"
DEMO_PASSWORD = "demo1234"


def build_sample_dataframe(seed: int = 42, n: int = 400) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    regions = ["North", "South", "East", "West"]
    categories = ["Electronics", "Apparel", "Home", "Grocery", "Toys"]
    channels = ["Online", "Retail", "Partner"]

    dates = pd.date_range("2024-01-01", periods=n, freq="D")
    region = rng.choice(regions, size=n, p=[0.3, 0.2, 0.25, 0.25])
    category = rng.choice(categories, size=n)
    channel = rng.choice(channels, size=n)

    base = rng.normal(500, 150, size=n).clip(20)
    # South underperforms slightly to create a findable signal.
    base = np.where(region == "South", base * 0.8, base)
    units = rng.poisson(8, size=n) + 1
    revenue = (base * units).round(2)

    # Inject a few extreme outliers.
    outlier_idx = rng.choice(n, size=6, replace=False)
    revenue[outlier_idx] *= rng.uniform(6, 12, size=6)

    discount = rng.uniform(0, 0.3, size=n).round(3)
    satisfaction = rng.integers(1, 6, size=n).astype(float)

    df = pd.DataFrame(
        {
            "order_date": dates,
            "region": region,
            "category": category,
            "channel": channel,
            "units": units,
            "unit_price": base.round(2),
            "discount": discount,
            "revenue": revenue,
            "customer_satisfaction": satisfaction,
        }
    )

    # Missing values in a couple of columns.
    miss_idx = rng.choice(n, size=int(n * 0.08), replace=False)
    df.loc[miss_idx, "customer_satisfaction"] = np.nan
    miss_idx2 = rng.choice(n, size=int(n * 0.03), replace=False)
    df.loc[miss_idx2, "discount"] = np.nan

    # A few duplicate rows.
    df = pd.concat([df, df.iloc[:5]], ignore_index=True)
    return df


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        if user is None:
            user = User(
                email=DEMO_EMAIL,
                name="Arjun Mehta",
                hashed_password=hash_password(DEMO_PASSWORD),
            )
            db.add(user)
            db.flush()
        else:
            user.name = "Arjun Mehta"
            db.flush()

        workspace = db.scalar(select(Workspace).where(Workspace.slug == "demo"))
        if workspace is None:
            workspace = Workspace(name="DataMind Production", slug="demo")
            db.add(workspace)
            db.flush()
            db.add(
                Membership(user_id=user.id, workspace_id=workspace.id, role=Role.OWNER)
            )
            db.flush()
        else:
            workspace.name = "DataMind Production"
            db.flush()

        # Showcase projects from design mockup
        mockup_projects = [
            {
                "name": "Customer Churn Analysis",
                "description": "Predict customer churn and identify key retention factors.",
                "business_domain": "Customer Analytics",
                "status": ProjectStatus.ACTIVE,
            },
            {
                "name": "Sales Performance 2024",
                "description": "Analyze sales trends, regions and product performance.",
                "business_domain": "Retail & E-commerce",
                "status": ProjectStatus.ACTIVE,
            },
            {
                "name": "Marketing Attribution",
                "description": "Multi-touch attribution modeling for marketing campaigns.",
                "business_domain": "Marketing",
                "status": ProjectStatus.DRAFT,
            },
            {
                "name": "Demand Forecasting",
                "description": "Time series forecasting for product demand and inventory.",
                "business_domain": "Supply Chain",
                "status": ProjectStatus.ACTIVE,
            },
            {
                "name": "User Behavior Analysis",
                "description": "Understand user behavior and product engagement.",
                "business_domain": "Product & Growth",
                "status": ProjectStatus.ACTIVE,
            },
            {
                "name": "Financial Risk Modeling",
                "description": "Credit risk assessment and default prediction modeling.",
                "business_domain": "Fintech & Banking",
                "status": ProjectStatus.ARCHIVED,
            },
        ]

        main_project = None
        for p_info in mockup_projects:
            proj = db.scalar(
                select(Project).where(
                    Project.workspace_id == workspace.id,
                    Project.name == p_info["name"],
                )
            )
            if proj is None:
                proj = Project(
                    workspace_id=workspace.id,
                    owner_id=user.id,
                    name=p_info["name"],
                    description=p_info["description"],
                    business_domain=p_info["business_domain"],
                    status=p_info["status"],
                    team_member_ids=[user.id],
                )
                db.add(proj)
                db.flush()
            if p_info["name"] == "Customer Churn Analysis":
                main_project = proj

        if main_project:
            existing_ds = db.scalar(
                select(Dataset).where(
                    Dataset.project_id == main_project.id,
                    Dataset.name == "Customer Data 2024",
                )
            )
            if existing_ds is None:
                df = build_sample_dataframe()
                buf = io.StringIO()
                df.to_csv(buf, index=False)
                raw = buf.getvalue().encode("utf-8")

                dataset = Dataset(
                    project_id=main_project.id,
                    workspace_id=workspace.id,
                    name="Customer Data 2024",
                    source_type="csv",
                    original_filename="customer_data_2024.csv",
                    content_type="text/csv",
                    size_bytes=len(raw),
                    status=DatasetStatus.PROFILING,
                    storage_key="",
                )
                db.add(dataset)
                db.flush()

                key = f"workspaces/{workspace.id}/datasets/{dataset.id}/customer_data_2024.csv"
                get_storage().put(key, raw, "text/csv")
                dataset.storage_key = key

                report = profile_dataframe(df)
                dataset.row_count = report["dataset_summary"]["rows"]
                dataset.column_count = report["dataset_summary"]["columns"]
                dataset.quality_score = report["quality"]["score"]
                dataset.status = DatasetStatus.READY
                db.add(ProfileReport(dataset_id=dataset.id, report=report))

        db.commit()
    finally:
        db.close()

    print("\nDataMind AI seed complete.")
    print("-" * 40)
    print(f"  Email:    {DEMO_EMAIL}")
    print(f"  Password: {DEMO_PASSWORD}")
    print("  User:     Arjun Mehta (Data Scientist)")
    print("  Workspace: DataMind Production")
    print("  Projects:  Seeded showcase projects from design mockup")
    print("-" * 40)


if __name__ == "__main__":
    main()
