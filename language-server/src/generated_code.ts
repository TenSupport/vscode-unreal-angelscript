import { assert } from 'console';
import * as scriptfiles from './as_parser';
import * as typedb from './database';

interface ProjectCodeGenerationSettings
{
    enable : boolean,
    generators : Generator[],
}

interface Generator
{
    derivedFrom : string,
    staticFunctions ?: GeneratedStaticFunction[],
    memberFunctions ?: GeneratedMemberFunction[],
    staticAccessors ?: GeneratedStaticAccessor[],
    memberAccessors ?: GeneratedMemberAccessor[],
}

interface GeneratedStaticFunction
{
    name : string,
    returnType : string,
    args ?: [GeneratorArgumentType],
}

interface GeneratedMemberFunction
{
    returnType : string,
    name : string,
    args ?: [GeneratorArgumentType],
    const : boolean,
    property : boolean,
}

interface GeneratedStaticAccessor
{
    derivedFrom ?: string,
    name : string,
    returnType : string,
    args ?: [GeneratorArgumentType],
}

interface GeneratedMemberAccessor
{
    derivedFrom ?: string,
    returnType : string,
    name : string,
    args ?: [GeneratorArgumentType],
    const : boolean,
    property : boolean,
}

interface GeneratorArgumentType
{
    type : string,
    name : string,
}

let ProjectCodeGenerationSettings : ProjectCodeGenerationSettings = {
    enable : false,
    generators : [],
};

export function GetProjectCodeGenerationSettings() : ProjectCodeGenerationSettings
{
    return ProjectCodeGenerationSettings;
}

export function ProcessScriptTypeGeneratedCode(dbtype : typedb.DBType, asmodule : scriptfiles.ASModule)
{
    // Code that all delegate structs have
    if (dbtype.isEvent || dbtype.isDelegate)
        AddGeneratedCodeForDelegate(dbtype, asmodule);

    if (dbtype.macroSpecifiers && dbtype.macroSpecifiers.has("NutClass"))
    {
        let decl = new typedb.DBNamespaceDeclaration;
        decl.declaredModule = dbtype.declaredModule;
        decl.declaredOffset = dbtype.moduleOffset;
        decl.declaredOffsetEnd = dbtype.moduleOffsetEnd;
        decl.scopeOffsetStart = dbtype.moduleScopeStart;
        decl.scopeOffsetEnd = dbtype.moduleScopeEnd;

        let nsType = typedb.DeclareNamespace(dbtype.namespace, dbtype.name, decl);

        AddGeneratedCodeForNutClass(asmodule, dbtype, nsType);
    }

    if (!dbtype.isStruct && !dbtype.isEnum)
    {
        let decl = new typedb.DBNamespaceDeclaration;
        decl.declaredModule = dbtype.declaredModule;
        decl.declaredOffset = dbtype.moduleOffset;
        decl.declaredOffsetEnd = dbtype.moduleOffsetEnd;
        decl.scopeOffsetStart = dbtype.moduleScopeStart;
        decl.scopeOffsetEnd = dbtype.moduleScopeEnd;

        let nsType = typedb.DeclareNamespace(dbtype.namespace, dbtype.name, decl);

        // Code that all UObject classes have
        AddGeneratedCodeForUObject(asmodule, dbtype, nsType);

        // Code that only actor components have
        if (dbtype.inheritsFrom("UActorComponent"))
            AddGeneratedCodeForUActorComponent(asmodule, dbtype, nsType);

        // Code that only actors have
        if (dbtype.inheritsFrom("AActor"))
            AddGeneratedCodeForAActor(asmodule, dbtype, nsType);

        // Code that only subsystems have
        if (dbtype.inheritsFrom("USubsystem"))
            AddGeneratedCodeForSubsystem(asmodule, dbtype, nsType);

        // Hazelight-specific generated code only if it's configured on
        if (scriptfiles.GetScriptSettings().useAngelscriptHaze)
            AddHazeGeneratedCode(asmodule, dbtype, nsType);

        // Project-specific generated code only if it's configured on
        if (ProjectCodeGenerationSettings.enable)
        {
            for (let generator of ProjectCodeGenerationSettings.generators)
            {
                if (dbtype.inheritsFrom(generator.derivedFrom))
                {
                    ApplyProjectGeneratedCode(asmodule, dbtype, nsType, generator);
                }
            }
        }

        // Merge namespace into the type database
        asmodule.namespaces.push(nsType);
    }
}

function AddGlobalFunction(asmodule : scriptfiles.ASModule, dbtype : typedb.DBType, namespace : typedb.DBNamespace, name : string) : typedb.DBMethod
{
    let method = new typedb.DBMethod();
    method.name = name;
    method.declaredModule = dbtype.declaredModule;
    method.moduleOffset = dbtype.moduleOffset;
    method.isAutoGenerated = true;

    namespace.addSymbol(method);
    asmodule.globalSymbols.push(method);
    return method;
}

function AddMethod(dbtype : typedb.DBType, name : string) : typedb.DBMethod
{
    let method = new typedb.DBMethod();
    method.name = name;
    method.declaredModule = dbtype.declaredModule;
    method.moduleOffset = dbtype.moduleOffset;
    method.isAutoGenerated = true;
    dbtype.addSymbol(method);
    return method;
}

function AddProperty(dbtype : typedb.DBType, name : string) : typedb.DBProperty
{
    let prop = new typedb.DBProperty();
    prop.name = name;
    prop.declaredModule = dbtype.declaredModule;
    prop.moduleOffset = dbtype.moduleOffset;
    prop.isAutoGenerated = true;
    dbtype.addSymbol(prop);
    return prop;
}

function AddGeneratedCodeForNutClass(asmodule : scriptfiles.ASModule, dbtype : typedb.DBType, nsType : typedb.DBNamespace)
{
    let method = AddGlobalFunction(asmodule, dbtype, nsType, "StaticNutClass");
    method.returnType = "FNutClassHandle";
    method.documentation = "Gets the NutClass descriptor for the class generated for the specified type.";
    method.args = [];
}

function AddGeneratedCodeForUObject(asmodule : scriptfiles.ASModule, dbtype : typedb.DBType, nsType : typedb.DBNamespace)
{
    if (!scriptfiles.GetScriptSettings().deprecateStaticClass && !scriptfiles.GetScriptSettings().disallowStaticClass)
    {
        let method = AddGlobalFunction(asmodule, dbtype, nsType, "StaticClass");
        method.returnType = "UClass";
        method.documentation = "Gets the descriptor for the class generated for the specified type.";
        method.args = [];
    }
}

function AddGeneratedCodeForUActorComponent(asmodule : scriptfiles.ASModule, dbtype : typedb.DBType, nsType : typedb.DBNamespace)
{
    {
        let method = AddGlobalFunction(asmodule, dbtype, nsType, "Get");
        method.returnType = dbtype.name;
        method.documentation = "Get the component of this type from an actor. Specified name is optional.";
        method.args = [
            new typedb.DBArg().init("AActor", "Actor"),
            new typedb.DBArg().init("FName", "WithName", "NAME_None"),
        ];
    }

    {
        let method = AddGlobalFunction(asmodule, dbtype, nsType, "GetOrCreate");
        method.returnType = dbtype.name;
        method.documentation = "Get a component of a particular type on an actor, create it if it doesn't exist. Specified name is optional.";
        method.args = [
            new typedb.DBArg().init("AActor", "Actor"),
            new typedb.DBArg().init("FName", "WithName", "NAME_None"),
        ];
    }

    {
        let method = AddGlobalFunction(asmodule, dbtype, nsType, "Create");
        method.returnType = dbtype.name;
        method.documentation = "Always create a new component of this type on an actor.";
        method.args = [
            new typedb.DBArg().init("AActor", "Actor"),
            new typedb.DBArg().init("FName", "WithName", "NAME_None"),
        ];
    }
}

function AddGeneratedCodeForAActor(asmodule : scriptfiles.ASModule, dbtype : typedb.DBType, nsType : typedb.DBNamespace)
{
    {
        let method = AddGlobalFunction(asmodule, dbtype, nsType, "Spawn");
        method.returnType = dbtype.name;
        method.documentation = "Spawn a new actor of this type into the world.";
        method.args = [
            new typedb.DBArg().init("FVector", "Location", "FVector::ZeroVector"),
            new typedb.DBArg().init("FRotator", "Rotation", "FRotator::ZeroRotator"),
            new typedb.DBArg().init("FName", "Name", "NAME_None"),
            new typedb.DBArg().init("bool", "bDeferredSpawn", "false"),
            new typedb.DBArg().init("ULevel", "Level", "nullptr"),
        ];
    }
}

function AddGeneratedCodeForSubsystem(asmodule : scriptfiles.ASModule, dbtype : typedb.DBType, nsType : typedb.DBNamespace)
{
    if (dbtype.inheritsFrom("ULocalPlayerSubsystem"))
    {
        {
            let method = AddGlobalFunction(asmodule, dbtype, nsType, "Get");
            method.returnType = dbtype.name;
            method.documentation = "Get the "+dbtype.getDisplayName()+" subsystem for this local player.";
            method.args = [
                new typedb.DBArg().init("ULocalPlayer", "LocalPlayer"),
            ];
        }

        {
            let method = AddGlobalFunction(asmodule, dbtype, nsType, "Get");
            method.returnType = dbtype.name;
            method.documentation = "Get the "+dbtype.getDisplayName()+" subsystem for this player controller.";
            method.args = [
                new typedb.DBArg().init("APlayerController", "PlayerController"),
            ];
        }
    }
    else
    {
        let method = AddGlobalFunction(asmodule, dbtype, nsType, "Get");
        method.returnType = dbtype.name;
        method.documentation = "Get the relevant "+dbtype.getDisplayName()+" subsystem.";
        method.args = [];
    }
}

function AddGeneratedCodeForDelegate(dbtype : typedb.DBType, asmodule : scriptfiles.ASModule)
{
    {
        let method = AddMethod(dbtype, "IsBound");
        method.returnType = "bool";
        method.documentation = "Whether the anything is bound to the delegate.";
        method.args = [];
    }

    {
        let method = AddMethod(dbtype, "Clear");
        method.returnType = "void";
        method.documentation = "Remove all bindings from the delegate.";
        method.args = [];
    }

    if (dbtype.isEvent)
    {
        {
            let method = AddMethod(dbtype, "Broadcast");
            method.returnType = dbtype.delegateReturn;
            method.documentation = "Broadcast event to all existing bindings.";
            method.args = new Array<typedb.DBArg>();
            for (let delegateArg of dbtype.delegateArgs)
            {
                let arg = new typedb.DBArg();
                arg.name = delegateArg.name;
                arg.typename = delegateArg.typename;
                method.args.push(arg);
            }
        }

        {
            let method = AddMethod(dbtype, "AddUFunction");
            method.returnType = "void";
            method.documentation = "Add a new binding to this event. Make sure the function you're binding is a UFUNCTION().";
            method.isDelegateBindFunction = true;
            method.delegateBindType = dbtype.name;
            method.delegateObjectParam = 0;
            method.delegateFunctionParam = 1;
            method.args = [
                new typedb.DBArg().init("UObject", "Object"),
                new typedb.DBArg().init("FName", "FunctionName"),
            ];
        }

        {
            let method = AddMethod(dbtype, "Unbind");
            method.returnType = "void";
            method.documentation = "Unbind a specific function that was previously added to this event.";
            method.isDelegateBindFunction = true;
            method.delegateBindType = dbtype.name;
            method.delegateObjectParam = 0;
            method.delegateFunctionParam = 1;
            method.args = [
                new typedb.DBArg().init("UObject", "Object"),
                new typedb.DBArg().init("FName", "FunctionName"),
            ];
        }

        {
            let method = AddMethod(dbtype, "UnbindObject");
            method.returnType = "void";
            method.documentation = "Unbind all previously added functions that are called on the specified object.";
            method.args = [
                new typedb.DBArg().init("UObject", "Object"),
            ];
        }
    }
    else
    {
        {
            let method = AddMethod(dbtype, "Execute");
            method.returnType = dbtype.delegateReturn;
            method.documentation = "Execute the function bound to the delegate. Will throw an error if nothing is bound, use ExecuteIfBound() if you do not want an error in that case.";
            method.args = new Array<typedb.DBArg>();
            for (let delegateArg of dbtype.delegateArgs)
            {
                let arg = new typedb.DBArg();
                arg.name = delegateArg.name;
                arg.typename = delegateArg.typename;
                method.args.push(arg);
            }
        }

        {
            let method = AddMethod(dbtype, "ExecuteIfBound");
            method.returnType = dbtype.delegateReturn;
            method.documentation = "Execute the function if one is bound to the delegate, otherwise do nothing.";
            method.args = new Array<typedb.DBArg>();
            for (let delegateArg of dbtype.delegateArgs)
            {
                let arg = new typedb.DBArg();
                arg.name = delegateArg.name;
                arg.typename = delegateArg.typename;
                method.args.push(arg);
            }
        }

        {
            let method = AddMethod(dbtype, "BindUFunction");
            method.returnType = "void";
            method.documentation = "Set the function that is bound to this delegate. Make sure the function you're binding is a UFUNCTION().";
            method.delegateBindType = dbtype.name;
            method.delegateObjectParam = 0;
            method.delegateFunctionParam = 1;
            method.isDelegateBindFunction = true;
            method.args = [
                new typedb.DBArg().init("UObject", "Object"),
                new typedb.DBArg().init("FName", "FunctionName"),
            ];
        }

        {
            let method = AddMethod(dbtype, "GetUObject");
            method.isProperty = true;
            method.name = "GetUObject";
            method.returnType = "UObject";
            method.documentation = "Get the object that this delegate is bound to. Returns nullptr if unbound.";
            method.args = [];
        }

        {
            let method = AddMethod(dbtype, "GetFunctionName");
            method.isProperty = true;
            method.returnType = "FName";
            method.documentation = "Get the function that this delegate is bound to. Returns NAME_None if unbound.";
            method.args = [];
        }

        {
            let method = AddGlobalFunction(asmodule, dbtype, dbtype.namespace, dbtype.name);
            method.returnType = dbtype.name;
            method.documentation = dbtype.documentation;
            method.isConstructor = true;
            method.args = [
                new typedb.DBArg().init("UObject", "Object", "nullptr"),
                new typedb.DBArg().init("FName", "FunctionName", "NAME_None"),
            ];
        }
    }

    return dbtype;
}

function AddHazeGeneratedCode(asmodule : scriptfiles.ASModule, dbtype : typedb.DBType, nsType : typedb.DBNamespace)
{
    if (dbtype.inheritsFrom("UHazeComposableSettings"))
        AddGeneratedCodeForUHazeComposableSettings(asmodule, dbtype, nsType);
    else if (dbtype.inheritsFrom("UHazeEffectEventHandler"))
        AddGeneratedCodeForUHazeEffectEventHandler(asmodule, dbtype, nsType);
}

function AddGeneratedCodeForUHazeComposableSettings(asmodule : scriptfiles.ASModule, dbtype : typedb.DBType, nsType : typedb.DBNamespace)
{
    {
        let method = AddGlobalFunction(asmodule, dbtype, nsType, "GetSettings");
        method.returnType = dbtype.name;
        method.documentation = "Get the result settings asset for a specific actor.";
        method.args = [
            new typedb.DBArg().init("AHazeActor", "Actor"),
        ];
    }

    {
        let method = AddGlobalFunction(asmodule, dbtype, nsType, "TakeTransientSettings");
        method.returnType = dbtype.name;
        method.documentation = "Grab a transient settings asset that can be used to temporarily overried values. Must be returned with Actor.ReturnTransientSettings to apply new values.";
        method.args = [
            new typedb.DBArg().init("AHazeActor", "Actor"),
            new typedb.DBArg().init("FInstigator", "Instigator"),
            new typedb.DBArg().init("EHazeSettingsPriority", "Priority", "EHazeSettingsPriority::Script"),
        ];
    }

    dbtype.forEachSymbol(function (sym : typedb.DBSymbol)
    {
        if (!(sym instanceof typedb.DBProperty))
            return;
        let dbprop : typedb.DBProperty = sym;
        if (!dbprop.isUProperty)
            return;

        {
            let overrideProp = AddProperty(dbtype, "bOverride_"+dbprop.name);
            overrideProp.moduleOffset = dbprop.moduleOffset;
            overrideProp.typename = "bool";
        }

        let setName = dbprop.name;
        if (setName[0] == 'b' && setName.length >= 2 && setName[1] == setName[1].toUpperCase())
            setName = setName.substring(1);

        dbprop.auxiliarySymbols = [];

        {
            let method = AddGlobalFunction(asmodule, dbtype, nsType, "Set"+setName);
            method.returnType = "void";
            method.documentation = "Apply a transient override for this composable settings property.";
            method.moduleOffset = dbprop.moduleOffset;
            method.args = [
                new typedb.DBArg().init("AHazeActor", "Actor"),
                new typedb.DBArg().init(dbprop.typename, "NewValue"),
                new typedb.DBArg().init("FInstigator", "Instigator"),
                new typedb.DBArg().init("EHazeSettingsPriority", "Priority", "EHazeSettingsPriority::Script"),
            ];

            method.auxiliarySymbols = [{symbol_name: dbprop.name, container_type: dbtype.name}, {symbol_name: "Clear"+dbprop.name, container_type: nsType.getQualifiedNamespace()}];
            dbprop.auxiliarySymbols.push({symbol_name: method.name, container_type: nsType.getQualifiedNamespace()});
        }

        {
            let method = AddGlobalFunction(asmodule, dbtype, nsType, "Clear"+setName);
            method.returnType = "void";
            method.documentation = "Clear a previously applied transient override.";
            method.moduleOffset = dbprop.moduleOffset;
            method.args = [
                new typedb.DBArg().init("AHazeActor", "Actor"),
                new typedb.DBArg().init("FInstigator", "Instigator"),
                new typedb.DBArg().init("EHazeSettingsPriority", "Priority", "EHazeSettingsPriority::Script"),
            ];

            method.auxiliarySymbols = [{symbol_name: dbprop.name, container_type: dbtype.name}, {symbol_name: "Set"+dbprop.name, container_type: nsType.getQualifiedNamespace()}];
            dbprop.auxiliarySymbols.push({symbol_name: method.name, container_type: nsType.getQualifiedNamespace()});
        }
    });
}

function AddGeneratedCodeForUHazeEffectEventHandler(asmodule : scriptfiles.ASModule, dbtype : typedb.DBType, nsType : typedb.DBNamespace)
{
    dbtype.forEachSymbol(function (sym : typedb.DBSymbol)
    {
        if (!(sym instanceof typedb.DBMethod))
            return;
        let dbfunc : typedb.DBMethod = sym;
        if (!dbfunc.isUFunction)
            return;
        if (!dbfunc.isBlueprintEvent)
            return;
        if (dbfunc.isBlueprintOverride)
            return;
        if (dbfunc.args && dbfunc.args.length > 1)
            return;
        if (dbfunc.returnType && dbfunc.returnType != "void")
            return;

        {
            let method = AddGlobalFunction(asmodule, dbtype, nsType, "Trigger_"+dbfunc.name);
            method.returnType = "void";
            if (dbfunc.documentation)
                method.documentation = dbfunc.documentation;
            else
                method.documentation = `Trigger the effect event ${dbfunc.name} on all handlers for ${dbtype.getDisplayName()}`;
            method.moduleOffset = dbfunc.moduleOffset;

            let actorType = "AHazeActor";
            if (dbtype.macroMeta && dbtype.macroMeta.has("requireactortype"))
                actorType = dbtype.macroMeta.get("requireactortype");

            method.args = [
                new typedb.DBArg().init(actorType, "Actor"),
            ];

            if (dbfunc.args && dbfunc.args.length == 1)
            {
                method.args.push(
                    new typedb.DBArg().init(dbfunc.args[0].typename, dbfunc.args[0].name)
                );
            }

            method.auxiliarySymbols = [{symbol_name: dbfunc.name, container_type: dbtype.name}];
            dbfunc.auxiliarySymbols = [{symbol_name: method.name, container_type: nsType.getQualifiedNamespace()}];
        }
    });
}

function ApplyProjectGeneratedCode(asmodule : scriptfiles.ASModule, dbtype : typedb.DBType, nsType : typedb.DBNamespace, generator : Generator) {
    let Replace = (value : string, replacements : [string, string][]) => {
        for (let [token, replacement] of replacements) {
            value = value.replace(new RegExp(`\{${token}\}`, 'g'), replacement);
        }
        return value;
    };

    // Apply non-accessors
    {
        let tokens : [string, string][] = [['class', dbtype.name]];
        generator.staticFunctions?.forEach((func) =>
        {
            let method = AddGlobalFunction(asmodule, dbtype, nsType, Replace(func.name, tokens));
            method.isAutoGenerated = true;
            method.returnType = Replace(func.returnType, tokens);
            method.args = (func.args || []).map((arg) => {
                return new typedb.DBArg().init(Replace(arg.type, tokens), Replace(arg.name, tokens));
            });
        });
        generator.memberFunctions?.forEach((func) =>
        {
            let method = AddMethod(dbtype, Replace(func.name, tokens));
            method.isAutoGenerated = true;
            method.returnType = Replace(func.returnType, tokens);
            method.isConst = func.const;
            method.isProperty = func.property;
            method.args = (func.args || []).map((arg) => {
                return new typedb.DBArg().init(Replace(arg.type, tokens), Replace(arg.name, tokens));
            });
        });
    }

    // Apply accessors
    dbtype.forEachSymbol(function (sym : typedb.DBSymbol)
    {
        if (!(sym instanceof typedb.DBProperty))
            return;
        let prop = sym;
        if (!prop.declaredModule)
            return;
        let propType = typedb.LookupType(prop.namespace, prop.typename);
        if (!propType)
            return;
        let tokens : [string, string][] = [
            ['class', dbtype.name],
            ['propType', propType.name],
            ['propName', prop.name]
        ];
        generator.staticAccessors?.forEach((func) =>
        {
            if (func.derivedFrom !== undefined && !propType.inheritsFrom(func.derivedFrom))
                return;
            let method = AddGlobalFunction(asmodule, dbtype, nsType, Replace(func.name, tokens));
            method.isAutoGenerated = true;
            method.returnType = Replace(func.returnType, tokens);
            method.args = (func.args || []).map((arg) => {
                return new typedb.DBArg().init(Replace(arg.type, tokens), Replace(arg.name, tokens));
            });
        });
        generator.memberAccessors?.forEach((func) =>
        {
            if (func.derivedFrom !== undefined && !propType.inheritsFrom(func.derivedFrom))
                return;
            let method = AddMethod(dbtype, Replace(func.name, tokens));
            method.isAutoGenerated = true;
            method.returnType = Replace(func.returnType, tokens);
            method.isConst = func.const;
            method.isProperty = func.property;
            method.args = (func.args || []).map((arg) => {
                return new typedb.DBArg().init(Replace(arg.type, tokens), Replace(arg.name, tokens));
            });
        });
    }, false);
}
