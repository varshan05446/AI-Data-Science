"use client";

import * as React from "react";
import { Sliders, HelpCircle, Check, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface HyperparameterValues {
  [key: string]: any;
}

interface AlgorithmConfigProps {
  algorithmKey: string;
  algorithmLabel: string;
  params: HyperparameterValues;
  onChange: (params: HyperparameterValues) => void;
}

export function AlgorithmConfig({
  algorithmKey,
  algorithmLabel,
  params,
  onChange,
}: AlgorithmConfigProps) {
  function update(key: string, value: any) {
    onChange({ ...params, [key]: value });
  }

  const isRandomForest = algorithmKey.includes("random_forest");
  const isDecisionTree = algorithmKey.includes("decision_tree");
  const isLogisticRegression = algorithmKey.includes("logistic_regression");
  const isSvm = algorithmKey.includes("svm");
  const isKnn = algorithmKey.includes("knn");
  const isBoosting = algorithmKey.includes("gradient_boosting") || algorithmKey.includes("xgboost") || algorithmKey.includes("lightgbm") || algorithmKey.includes("catboost");
  const isLinearRidgeLasso = algorithmKey.includes("linear") || algorithmKey.includes("ridge") || algorithmKey.includes("lasso") || algorithmKey.includes("elasticnet");
  const isMlp = algorithmKey.includes("mlp");
  const isNaiveBayes = algorithmKey.includes("naive_bayes");

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sliders className="h-4 w-4 text-primary" />
            {algorithmLabel} Hyperparameters
          </CardTitle>
          <Badge variant="outline" className="text-[10px] font-mono">
            scikit-learn / XGBoost Config
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        {/* Random Forest Config */}
        {isRandomForest && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">n_estimators (Trees)</Label>
              <input
                type="number"
                min={10}
                max={2000}
                value={params.n_estimators ?? 100}
                onChange={(e) => update("n_estimators", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">max_depth</Label>
              <input
                type="number"
                placeholder="None (unlimited)"
                value={params.max_depth ?? ""}
                onChange={(e) => update("max_depth", e.target.value ? Number(e.target.value) : null)}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">criterion</Label>
              <select
                value={params.criterion ?? "gini"}
                onChange={(e) => update("criterion", e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="gini">gini</option>
                <option value="entropy">entropy</option>
                <option value="log_loss">log_loss</option>
                <option value="squared_error">squared_error</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">min_samples_split</Label>
              <input
                type="number"
                min={2}
                value={params.min_samples_split ?? 2}
                onChange={(e) => update("min_samples_split", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">min_samples_leaf</Label>
              <input
                type="number"
                min={1}
                value={params.min_samples_leaf ?? 1}
                onChange={(e) => update("min_samples_leaf", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">max_features</Label>
              <select
                value={params.max_features ?? "sqrt"}
                onChange={(e) => update("max_features", e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="sqrt">sqrt</option>
                <option value="log2">log2</option>
                <option value="none">none (all features)</option>
              </select>
            </div>
          </div>
        )}

        {/* Decision Tree Config */}
        {isDecisionTree && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">criterion</Label>
              <select
                value={params.criterion ?? "gini"}
                onChange={(e) => update("criterion", e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="gini">gini</option>
                <option value="entropy">entropy</option>
                <option value="squared_error">squared_error</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">splitter</Label>
              <select
                value={params.splitter ?? "best"}
                onChange={(e) => update("splitter", e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="best">best</option>
                <option value="random">random</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">max_depth</Label>
              <input
                type="number"
                placeholder="None"
                value={params.max_depth ?? ""}
                onChange={(e) => update("max_depth", e.target.value ? Number(e.target.value) : null)}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">min_samples_split</Label>
              <input
                type="number"
                min={2}
                value={params.min_samples_split ?? 2}
                onChange={(e) => update("min_samples_split", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">min_samples_leaf</Label>
              <input
                type="number"
                min={1}
                value={params.min_samples_leaf ?? 1}
                onChange={(e) => update("min_samples_leaf", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
          </div>
        )}

        {/* Logistic Regression Config */}
        {isLogisticRegression && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">penalty</Label>
              <select
                value={params.penalty ?? "l2"}
                onChange={(e) => update("penalty", e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="l2">l2</option>
                <option value="l1">l1</option>
                <option value="elasticnet">elasticnet</option>
                <option value="none">none</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">C (Inverse Regularization)</Label>
              <input
                type="number"
                step="0.01"
                min="0.001"
                value={params.C ?? 1.0}
                onChange={(e) => update("C", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">solver</Label>
              <select
                value={params.solver ?? "lbfgs"}
                onChange={(e) => update("solver", e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="lbfgs">lbfgs</option>
                <option value="saga">saga</option>
                <option value="liblinear">liblinear</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">max_iter</Label>
              <input
                type="number"
                value={params.max_iter ?? 200}
                onChange={(e) => update("max_iter", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
          </div>
        )}

        {/* SVM Config */}
        {isSvm && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">kernel</Label>
              <select
                value={params.kernel ?? "rbf"}
                onChange={(e) => update("kernel", e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="rbf">rbf</option>
                <option value="linear">linear</option>
                <option value="poly">poly</option>
                <option value="sigmoid">sigmoid</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">C (Regularization)</Label>
              <input
                type="number"
                step="0.1"
                value={params.C ?? 1.0}
                onChange={(e) => update("C", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">gamma</Label>
              <select
                value={params.gamma ?? "scale"}
                onChange={(e) => update("gamma", e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="scale">scale</option>
                <option value="auto">auto</option>
              </select>
            </div>
          </div>
        )}

        {/* KNN Config */}
        {isKnn && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">n_neighbors</Label>
              <input
                type="number"
                min={1}
                max={50}
                value={params.n_neighbors ?? 5}
                onChange={(e) => update("n_neighbors", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">weights</Label>
              <select
                value={params.weights ?? "uniform"}
                onChange={(e) => update("weights", e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="uniform">uniform</option>
                <option value="distance">distance</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">metric</Label>
              <select
                value={params.metric ?? "minkowski"}
                onChange={(e) => update("metric", e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="minkowski">minkowski</option>
                <option value="euclidean">euclidean</option>
                <option value="manhattan">manhattan</option>
              </select>
            </div>
          </div>
        )}

        {/* Gradient Boosting / XGBoost / LightGBM / CatBoost Config */}
        {isBoosting && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">learning_rate</Label>
              <input
                type="number"
                step="0.01"
                min="0.001"
                max="1.0"
                value={params.learning_rate ?? 0.1}
                onChange={(e) => update("learning_rate", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">n_estimators</Label>
              <input
                type="number"
                min={10}
                max={2000}
                value={params.n_estimators ?? 100}
                onChange={(e) => update("n_estimators", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">max_depth</Label>
              <input
                type="number"
                min={1}
                max={30}
                value={params.max_depth ?? 3}
                onChange={(e) => update("max_depth", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">subsample</Label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                max="1.0"
                value={params.subsample ?? 1.0}
                onChange={(e) => update("subsample", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
          </div>
        )}

        {/* Linear/Ridge/Lasso Config */}
        {isLinearRidgeLasso && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">alpha (Regularization Strength)</Label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={params.alpha ?? 1.0}
                onChange={(e) => update("alpha", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">max_iter</Label>
              <input
                type="number"
                value={params.max_iter ?? 1000}
                onChange={(e) => update("max_iter", Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
              />
            </div>
          </div>
        )}

        {/* Fallback for general models */}
        {!isRandomForest && !isDecisionTree && !isLogisticRegression && !isSvm && !isKnn && !isBoosting && !isLinearRidgeLasso && (
          <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground flex items-center gap-2">
            <Info className="h-4 w-4 text-primary shrink-0" />
            Standard hyperparameter settings will be applied for {algorithmLabel}.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
