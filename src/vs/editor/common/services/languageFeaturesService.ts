/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageFeatureRegistry } from '../languageFeatureRegistry.js';
import { CodeActionProvider, CodeLensProvider, CompletionItemProvider, DocumentPasteEditProvider, DeclarationProvider, DefinitionProvider, DocumentColorProvider, DocumentFormattingEditProvider, MultiDocumentHighlightProvider, DocumentHighlightProvider, DocumentDropEditProvider, DocumentRangeFormattingEditProvider, DocumentRangeSemanticTokensProvider, DocumentSemanticTokensProvider, DocumentSymbolProvider, EvaluatableExpressionProvider, FoldingRangeProvider, HoverProvider, ImplementationProvider, InlayHintsProvider, InlineCompletionsProvider, InlineValuesProvider, LinkedEditingRangeProvider, LinkProvider, OnTypeFormattingEditProvider, ReferenceProvider, RenameProvider, SelectionRangeProvider, SignatureHelpProvider, TypeDefinitionProvider, NewSymbolNamesProvider } from '../languages.js';
import { ILanguageFeaturesService } from './languageFeatures.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';

export class LanguageFeaturesService implements ILanguageFeaturesService {

	declare _serviceBrand: undefined;

	readonly referenceProvider = new LanguageFeatureRegistry<ReferenceProvider>();
	readonly renameProvider = new LanguageFeatureRegistry<RenameProvider>();
	readonly newSymbolNamesProvider = new LanguageFeatureRegistry<NewSymbolNamesProvider>();
	readonly codeActionProvider = new LanguageFeatureRegistry<CodeActionProvider>();
	readonly definitionProvider = new LanguageFeatureRegistry<DefinitionProvider>();
	readonly typeDefinitionProvider = new LanguageFeatureRegistry<TypeDefinitionProvider>();
	readonly declarationProvider = new LanguageFeatureRegistry<DeclarationProvider>();
	readonly implementationProvider = new LanguageFeatureRegistry<ImplementationProvider>();
	readonly documentSymbolProvider = new LanguageFeatureRegistry<DocumentSymbolProvider>();
	readonly inlayHintsProvider = new LanguageFeatureRegistry<InlayHintsProvider>();
	readonly colorProvider = new LanguageFeatureRegistry<DocumentColorProvider>();
	readonly codeLensProvider = new LanguageFeatureRegistry<CodeLensProvider>();
	readonly documentFormattingEditProvider = new LanguageFeatureRegistry<DocumentFormattingEditProvider>();
	readonly documentRangeFormattingEditProvider = new LanguageFeatureRegistry<DocumentRangeFormattingEditProvider>();
	readonly onTypeFormattingEditProvider = new LanguageFeatureRegistry<OnTypeFormattingEditProvider>();
	readonly signatureHelpProvider = new LanguageFeatureRegistry<SignatureHelpProvider>();
	readonly hoverProvider = new LanguageFeatureRegistry<HoverProvider>();
	readonly documentHighlightProvider = new LanguageFeatureRegistry<DocumentHighlightProvider>();
	readonly multiDocumentHighlightProvider = new LanguageFeatureRegistry<MultiDocumentHighlightProvider>();
	readonly selectionRangeProvider = new LanguageFeatureRegistry<SelectionRangeProvider>();
	readonly foldingRangeProvider = new LanguageFeatureRegistry<FoldingRangeProvider>();
	readonly linkProvider = new LanguageFeatureRegistry<LinkProvider>();
	readonly inlineCompletionsProvider = new LanguageFeatureRegistry<InlineCompletionsProvider>();
	readonly completionProvider = new LanguageFeatureRegistry<CompletionItemProvider>();
	readonly linkedEditingRangeProvider = new LanguageFeatureRegistry<LinkedEditingRangeProvider>();
	readonly inlineValuesProvider = new LanguageFeatureRegistry<InlineValuesProvider>();
	readonly evaluatableExpressionProvider = new LanguageFeatureRegistry<EvaluatableExpressionProvider>();
	readonly documentRangeSemanticTokensProvider = new LanguageFeatureRegistry<DocumentRangeSemanticTokensProvider>();
	readonly documentSemanticTokensProvider = new LanguageFeatureRegistry<DocumentSemanticTokensProvider>();
	readonly documentDropEditProvider = new LanguageFeatureRegistry<DocumentDropEditProvider>();
	readonly documentPasteEditProvider = new LanguageFeatureRegistry<DocumentPasteEditProvider>();

}

registerSingleton(ILanguageFeaturesService, LanguageFeaturesService, InstantiationType.Delayed);
