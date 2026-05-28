# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import random

# Django imports
from django.db import IntegrityError, transaction

# Third Party imports
from rest_framework.response import Response
from rest_framework import status

# Module imports
from .. import BaseViewSet, BaseAPIView
from plane.app.serializers import LabelSerializer
from plane.app.permissions import allow_permission, ProjectBasePermission, ROLE
from plane.db.models import Project, Label, ProjectMember
from plane.utils.cache import invalidate_cache


class LabelViewSet(BaseViewSet):
    serializer_class = LabelSerializer
    model = Label
    permission_classes = [ProjectBasePermission]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(project__project_projectmember__member=self.request.user)
            .select_related("project")
            .select_related("workspace")
            .select_related("parent")
            .distinct()
            .order_by("sort_order")
        )

    @invalidate_cache(path="/api/workspaces/:slug/labels/", url_params=True, user=False, multiple=True)
    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        try:
            serializer = LabelSerializer(data=request.data, context={"project_id": project_id})
            if serializer.is_valid():
                serializer.save(project_id=project_id)
                return Response(serializer.data, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except IntegrityError:
            return Response(
                {"error": "Label with the same name already exists in the project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @invalidate_cache(path="/api/workspaces/:slug/labels/", url_params=True, user=False)
    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, *args, **kwargs):
        # Check if the label name is unique within the project
        if (
            "name" in request.data
            and Label.objects.filter(project_id=kwargs["project_id"], name=request.data["name"])
            .exclude(pk=kwargs["pk"])
            .exists()
        ):
            return Response(
                {"error": "Label with the same name already exists in the project"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = LabelSerializer(
            instance=self.get_object(),
            data=request.data,
            context={"project_id": kwargs["project_id"]},
            partial=True,
        )

        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @invalidate_cache(path="/api/workspaces/:slug/labels/", url_params=True, user=False)
    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, *args, **kwargs):
        return super().destroy(request, *args, **kwargs)


class BulkCreateIssueLabelsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        label_data = request.data.get("label_data", [])

        project = Project.objects.get(pk=project_id)

        labels = Label.objects.bulk_create(
            [
                Label(
                    name=label.get("name", "Migrated"),
                    description=label.get("description", "Migrated Issue"),
                    color=f"#{random.randint(0, 0xFFFFFF + 1):06X}",
                    project_id=project_id,
                    workspace_id=project.workspace_id,
                    created_by=request.user,
                    updated_by=request.user,
                )
                for label in label_data
            ],
            batch_size=50,
            ignore_conflicts=True,
        )

        return Response(
            {"labels": LabelSerializer(labels, many=True).data},
            status=status.HTTP_201_CREATED,
        )


class CopyLabelsFromProjectEndpoint(BaseAPIView):
    """Fork-only: copy labels from another project in the same workspace.

    Policy (per user spec):
      * If the source label is a CATEGORY (has children) AND a label with
        the same name already exists in the target → reuse the existing
        one. Children are then attached to that reused category. This
        makes the action additive — running it twice doesn't multiply
        categories.
      * If the source label is a regular (child) label:
          - on_conflict="skip"   (default) → don't copy a same-named one.
          - on_conflict="rename"          → copy as "<name> (копия)".
        Replace is intentionally NOT supported (mutating existing data
        via a copy action surprises users).
      * Parent labels referenced by selected children are AUTO-INCLUDED
        even if the user didn't tick them. Otherwise children would lose
        their category context.

    Request body:
        {
          "source_project_id": "<uuid>",
          "label_ids": ["<uuid>", ...],
          "on_conflict": "skip" | "rename"        # optional, default "skip"
        }

    Response 201:
        {
          "created":  [LabelSerializer.data, ...],
          "reused":   [{"id", "name"}, ...],   # categories reused by name
          "renamed":  [LabelSerializer.data, ...],
          "skipped":  [{"name", "reason"}, ...]
        }
    """

    @allow_permission([ROLE.ADMIN])
    @invalidate_cache(
        path="/api/workspaces/:slug/labels/", url_params=True, user=False, multiple=True
    )
    def post(self, request, slug, project_id):
        source_project_id = request.data.get("source_project_id")
        label_ids = request.data.get("label_ids") or []
        on_conflict = request.data.get("on_conflict", "skip")

        if not source_project_id:
            return Response(
                {"error": "source_project_id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if str(source_project_id) == str(project_id):
            return Response(
                {"error": "Source and target project must differ"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if on_conflict not in ("skip", "rename"):
            return Response(
                {"error": "on_conflict must be 'skip' or 'rename'"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not label_ids:
            return Response(
                {"error": "label_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # The user must be a member of BOTH projects within this workspace.
        # The decorator already validated target; check source explicitly so
        # someone can't peek labels from a project they have no access to.
        source_membership = ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=source_project_id,
            member=request.user,
            is_active=True,
        ).exists()
        if not source_membership:
            return Response(
                {"error": "You don't have access to the source project"},
                status=status.HTTP_403_FORBIDDEN,
            )

        target_project = Project.objects.filter(
            workspace__slug=slug, pk=project_id
        ).first()
        if target_project is None:
            return Response(
                {"error": "Target project not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Fetch the labels the user selected, scoped to the source project.
        selected = list(
            Label.objects.filter(
                workspace__slug=slug,
                project_id=source_project_id,
                id__in=label_ids,
                deleted_at__isnull=True,
            )
        )
        source_by_id = {str(lbl.id): lbl for lbl in selected}

        # Auto-include parents that weren't explicitly selected so children
        # retain their category context in the target project.
        to_fetch_parents = {
            lbl.parent_id for lbl in selected if lbl.parent_id and str(lbl.parent_id) not in source_by_id
        }
        if to_fetch_parents:
            extra = Label.objects.filter(
                workspace__slug=slug,
                project_id=source_project_id,
                id__in=to_fetch_parents,
                deleted_at__isnull=True,
            )
            for lbl in extra:
                source_by_id[str(lbl.id)] = lbl

        # Topological order: parents before children. We rely on the strict
        # 2-level hierarchy convention enforced by the picker (a parent
        # label itself has no parent).
        ordered: list[Label] = []
        seen: set[str] = set()

        def _visit(lid: str) -> None:
            if lid in seen or lid not in source_by_id:
                return
            seen.add(lid)
            lbl = source_by_id[lid]
            if lbl.parent_id and str(lbl.parent_id) in source_by_id:
                _visit(str(lbl.parent_id))
            ordered.append(lbl)

        for lid in list(source_by_id):
            _visit(lid)

        # Index existing target labels by lowercased name for conflict checks.
        existing_target = {
            lbl.name.lower(): lbl
            for lbl in Label.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                deleted_at__isnull=True,
            )
        }

        # Annotate source labels with "is_category" — easier than per-label
        # extra queries. A category has at least one child WITHIN the source
        # project (children outside the project don't make sense for the
        # 2-level hierarchy).
        is_category_set = set(
            map(
                str,
                Label.objects.filter(
                    workspace__slug=slug,
                    project_id=source_project_id,
                    parent_id__in=[lbl.id for lbl in ordered],
                    deleted_at__isnull=True,
                ).values_list("parent_id", flat=True),
            )
        )

        # Map source UUID → target UUID for new-parent resolution.
        old_to_new: dict[str, str] = {}
        results = {"created": [], "reused": [], "renamed": [], "skipped": []}

        with transaction.atomic():
            for src in ordered:
                src_id = str(src.id)
                src_is_category = src_id in is_category_set
                name_key = src.name.lower()
                existing = existing_target.get(name_key)

                # Resolve new parent_id from the mapping built so far.
                new_parent_id = (
                    old_to_new.get(str(src.parent_id)) if src.parent_id else None
                )

                if existing is not None:
                    if src_is_category:
                        # Reuse existing category by name.
                        old_to_new[src_id] = str(existing.id)
                        results["reused"].append({"id": str(existing.id), "name": existing.name})
                        continue
                    if on_conflict == "skip":
                        results["skipped"].append({"name": src.name, "reason": "name_exists"})
                        continue
                    # on_conflict == "rename": fall through to create with suffix.
                    suffix = 1
                    new_name = f"{src.name} (копия)"
                    while new_name.lower() in existing_target:
                        suffix += 1
                        new_name = f"{src.name} (копия {suffix})"
                    name_to_use = new_name
                else:
                    name_to_use = src.name

                new_label = Label.objects.create(
                    workspace_id=target_project.workspace_id,
                    project_id=project_id,
                    name=name_to_use,
                    color=src.color,
                    description=src.description or "",
                    parent_id=new_parent_id,
                    created_by=request.user,
                    updated_by=request.user,
                )
                existing_target[name_to_use.lower()] = new_label
                old_to_new[src_id] = str(new_label.id)
                bucket = "renamed" if (existing is not None and on_conflict == "rename") else "created"
                results[bucket].append(LabelSerializer(new_label).data)

        return Response(results, status=status.HTTP_201_CREATED)
